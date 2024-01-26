/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import { ExtensionContext, TextEditor } from "vscode";
import { FSWatcher, WatchEventType } from "fs";
import { ChildProcess } from "child_process";

import {
    buildPqTestArgs,
    CreateAuthState,
    Credential,
    ExtensionInfo,
    GenericResult,
    IPQTestService,
} from "../common/PQTestService";
import { Disposable, IDisposable } from "../common/Disposable";
import { DisposableEventEmitter, ExtractEventTypes } from "../common/DisposableEventEmitter";
import { executeBuildTaskAndAwaitIfNeeded, formatArguments, inferAnyGeneralErrorString } from "./PqTestTaskUtils";
import { extensionI18n, resolveI18nTemplate } from "../i18n/extension";
import { GlobalEventBus, GlobalEvents } from "../GlobalEventBus";

import { ProcessExit, SpawnedProcess } from "../common/SpawnedProcess";
import { convertStringToInteger } from "../utils/numbers";
import { ExtensionConfigurations } from "../constants/PowerQuerySdkConfiguration";
import { pidIsRunning } from "../utils/pids";
import { PqSdkOutputChannel } from "../features/PqSdkOutputChannel";
import { PQTestTask } from "../common/PowerQueryTask";
import { resolveSubstitutedValues } from "../utils/vscodes";
import { ValueEventEmitter } from "../common/ValueEventEmitter";

// eslint-disable-next-line @typescript-eslint/typedef
export const PqTestExecutableTaskQueueEvents = {
    processCreated: "PqTestExecutable.processCreated" as const,
    processExited: "PqTestExecutable.processExited" as const,
};
type PqTestExecutableTaskQueueEventTypes = ExtractEventTypes<typeof PqTestExecutableTaskQueueEvents>;

/**
 * Internal interface within the module, we need not cast members as readonly
 */
interface PqTestExecutableTask extends PQTestTask {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolve: (res: any) => void;
    reject: (reason: Error | string) => void;
}

export class PqTestExecutableTaskError extends Error {
    constructor(
        public readonly pqTestExeFullPath: string,
        public readonly processArgs: string[],
        public readonly processExit: ProcessExit,
    ) {
        super(
            processExit.stderr
                ? processExit.stderr
                : `Failed to execute ${pqTestExeFullPath} ${formatArguments(processArgs)}`,
        );

        this.processExit = processExit;
    }
}

export class PqTestExecutableDetailedTaskError extends Error {
    constructor(
        public readonly details: string,
        public readonly pqTestExeFullPath: string,
        public readonly processArgs: string[],
        public readonly processExit: ProcessExit,
    ) {
        super(`${details}, failed to execute ${pqTestExeFullPath} ${formatArguments(processArgs)}`);
        this.processExit = processExit;
    }
}

export class PqTestExecutableTaskQueue implements IPQTestService, IDisposable {
    public static readonly ExecutableName: string = "PQTest.exe";
    public static readonly ExecutablePidLockFileName: string = "pqTest.pid";

    private readonly eventBus: DisposableEventEmitter<PqTestExecutableTaskQueueEventTypes>;
    private readonly pidLockFileLocation: string;
    private firstTimeReady: boolean = true;
    private lastPqRelatedFileTouchedDate: Date = new Date(0);
    private onPQTestExecutablePidChangedFsWatcher: FSWatcher | undefined = undefined;
    private pendingTasks: PqTestExecutableTask[] = [];
    protected _disposables: Array<IDisposable> = [];
    pqTestReady: boolean = false;
    pqTestLocation: string = "";
    pqTestFullPath: string = "";
    public readonly currentExtensionInfos: ValueEventEmitter<ExtensionInfo[]> = new ValueEventEmitter<ExtensionInfo[]>(
        [],
    );
    public readonly currentCredentials: ValueEventEmitter<Credential[]> = new ValueEventEmitter<Credential[]>([]);

    constructor(
        private readonly vscExtCtx: ExtensionContext,
        private readonly globalEventBus: GlobalEventBus,
        private readonly outputChannel: PqSdkOutputChannel,
    ) {
        // init instance fields
        this.eventBus = new DisposableEventEmitter();
        this._disposables.unshift(this.eventBus);

        this.pidLockFileLocation = path.resolve(
            this.vscExtCtx.extensionPath,
            PqTestExecutableTaskQueue.ExecutablePidLockFileName,
        );

        // watch pqTest pid lock file
        this.doSetupAndWatchPQTestExecutablePidLockFile();

        this._disposables.unshift(
            new Disposable(() => {
                this.onPQTestExecutablePidChangedFsWatcher?.close();
            }),
        );

        // watch vsc ConfigDidChangePowerQuerySDK changes
        this._disposables.unshift(
            this.globalEventBus.subscribeOneEvent(
                GlobalEvents.VSCodeEvents.ConfigDidChangePowerQueryTestLocation,
                this.onPowerQueryTestLocationChanged.bind(this),
            ),
        );

        this.onPowerQueryTestLocationChanged();

        vscode.workspace.onDidSaveTextDocument((textDocument: vscode.TextDocument) => {
            if (
                (textDocument.uri.fsPath.indexOf(".pq") > -1 && textDocument.uri.fsPath.indexOf(".query.pq") === -1) ||
                textDocument.uri.fsPath.indexOf(".m") > -1
            ) {
                this.lastPqRelatedFileTouchedDate = new Date();
            }
        });

        vscode.workspace.onDidCreateFiles((evt: vscode.FileCreateEvent) => {
            const filteredPaths: string[] = evt.files
                .filter(
                    (oneUri: vscode.Uri) =>
                        (oneUri.fsPath.indexOf(".pq") > -1 && oneUri.fsPath.indexOf(".query.pq") === -1) ||
                        oneUri.fsPath.indexOf(".m") > -1,
                )
                .map((oneUri: vscode.Uri) => oneUri.fsPath);

            if (filteredPaths.length) {
                this.lastPqRelatedFileTouchedDate = new Date();
            }
        });
    }

    public subscribeOneEvent(
        eventName: PqTestExecutableTaskQueueEventTypes,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        listener: (...args: any[]) => void,
    ): IDisposable {
        return this.eventBus.subscribeOneEvent(eventName, listener);
    }

    public dispose = (): void => {
        for (const oneDisposable of this._disposables) {
            oneDisposable.dispose();
        }

        this.currentExtensionInfos.dispose();
        this.currentCredentials.dispose();
    };

    private resolvePQTestPath(nextPQTestLocation: string | undefined): string | undefined {
        if (!nextPQTestLocation) {
            this.outputChannel.appendErrorLine(extensionI18n["PQSdk.taskQueue.error.pqtestLocationNotSet"]);

            return undefined;
        } else if (!fs.existsSync(nextPQTestLocation)) {
            this.outputChannel.appendErrorLine(
                resolveI18nTemplate("PQSdk.taskQueue.error.pqtestLocationDoesntExist", {
                    nextPQTestLocation,
                }),
            );

            return undefined;
        }

        const pqtestExe: string = path.resolve(nextPQTestLocation, PqTestExecutableTaskQueue.ExecutableName);

        if (!fs.existsSync(pqtestExe)) {
            this.outputChannel.appendErrorLine(
                resolveI18nTemplate("PQSdk.taskQueue.error.pqtestExecutableDoesntExist", {
                    pqtestExe,
                }),
            );

            return undefined;
        }

        return pqtestExe;
    }

    private doSeizePQTestPidFromLockFile(thePidFileLocation: string = this.pidLockFileLocation): number | undefined {
        const pidString: string = fs.readFileSync(thePidFileLocation).toString("utf8");
        const result: number | undefined = convertStringToInteger(pidString);

        if (typeof result === "number") {
            this.outputChannel.appendTraceLine(`Read existing pqTest pid file content: ${pidString}, ${result}`);
        } else {
            this.outputChannel.appendTraceLine(`Read non-existing pqTest pid file. ${result}`);
        }

        return result;
    }

    private doWritePid(pid: string): void {
        fs.writeFileSync(this.pidLockFileLocation, pid);
    }

    private doSetupAndWatchPQTestExecutablePidLockFile(curPid: string = ""): void {
        // create or wipe pidLockFile
        if (!fs.existsSync(this.pidLockFileLocation)) {
            this.doWritePid(curPid);
            this.outputChannel.appendTraceLine(`Create empty pqTest pid file: ${this.pidLockFileLocation}`);
        } else {
            const pidNumber: number | undefined = this.doSeizePQTestPidFromLockFile();

            if (typeof pidNumber === "number" && !pidIsRunning(pidNumber.valueOf())) {
                this.doWritePid(curPid);
                this.outputChannel.appendTraceLine(`Wipe out pqTest pid file: ${this.pidLockFileLocation}`);
            } else {
                this.outputChannel.appendTraceLine(`Find running pqTest of pid ${pidNumber}`);
            }
        }

        // unwatch the previous one when it got renamed
        if (this.onPQTestExecutablePidChangedFsWatcher) this.onPQTestExecutablePidChangedFsWatcher.close();

        this.onPQTestExecutablePidChangedFsWatcher = fs.watch(
            this.pidLockFileLocation,
            {},
            this.onPQTestExecutablePidChanged.bind(this),
        );
    }

    private async doCheckPidAndDequeueOneTaskIfAny(): Promise<void> {
        const pidNumber: number | undefined = this.doSeizePQTestPidFromLockFile();

        if (typeof pidNumber !== "number" && this.pqTestFullPath) {
            // alright we can queue another task
            const pendingTask: PqTestExecutableTask | undefined = this.pendingTasks.shift();

            if (pendingTask) {
                // do fork one process and execute the task
                const pqTestExeFullPath: string = this.pqTestFullPath;
                const processArgs: string[] = buildPqTestArgs(pendingTask);

                this.outputChannel.appendInfoLine(
                    resolveI18nTemplate("PQSdk.taskQueue.info.taskFound", {
                        pqTestExeFullPath,
                        arguments: formatArguments(processArgs),
                    }),
                );

                const spawnProcess: SpawnedProcess = new SpawnedProcess(
                    pqTestExeFullPath,
                    processArgs,
                    { cwd: this.pqTestLocation },
                    {
                        stdinStr: pendingTask.stdinStr,
                        onSpawned: (childProcess: ChildProcess): void => {
                            this.doWritePid(`${childProcess.pid}` ?? "nan");

                            this.outputChannel.appendTraceLine(
                                resolveI18nTemplate("PQSdk.taskQueue.info.taskBegan", {
                                    operation: pendingTask.operation,
                                    pid: `${childProcess.pid}`,
                                }),
                            );
                        },
                    },
                );

                let processExit: ProcessExit = {
                    stdout: "",
                    stderr: "",
                    exitCode: null,
                    signal: "SIGINT",
                };

                try {
                    processExit = await spawnProcess.deferred$;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } catch (e: any | Error) {
                    processExit.stderr = typeof e === "string" ? e : e.toString();
                }

                this.doWritePid("");

                this.outputChannel.appendTraceLine(
                    resolveI18nTemplate("PQSdk.taskQueue.info.taskFinished", {
                        operation: pendingTask.operation,
                        pid: `${spawnProcess.pid}`,
                    }),
                );

                if (typeof processExit.exitCode === "number" && processExit.exitCode === 0) {
                    // no need to catch the JSON parse, we trusted pqtest
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    let resultJson: any = spawnProcess.stdOut;

                    try {
                        let stdOutStr: string = spawnProcess.stdOut;

                        // preserve newlines, etc - use valid JSON
                        stdOutStr = stdOutStr
                            .replace(/\\n/g, "\\n")
                            .replace(/\\'/g, "\\'")
                            .replace(/\\"/g, '\\"')
                            .replace(/\\&/g, "\\&")
                            .replace(/\\r/g, "\\r")
                            .replace(/\\t/g, "\\t")
                            .replace(/\\b/g, "\\b")
                            .replace(/\\f/g, "\\f");

                        // remove non-printable and other non-valid JSON chars
                        // eslint-disable-next-line no-control-regex
                        stdOutStr = stdOutStr.replace(/[\u0000-\u0019]+/g, "");
                        resultJson = JSON.parse(stdOutStr);
                    } catch (e) {
                        // noop
                    }

                    const errMessage: string = inferAnyGeneralErrorString(resultJson);

                    if (errMessage) {
                        pendingTask.reject(
                            new PqTestExecutableDetailedTaskError(
                                errMessage,
                                pqTestExeFullPath,
                                processArgs,
                                processExit,
                            ),
                        );
                    } else {
                        if (pendingTask.operation === "info") {
                            this.currentExtensionInfos.emit(resultJson);
                        } else if (pendingTask.operation === "list-credential") {
                            this.currentCredentials.emit(resultJson);
                        }

                        pendingTask.resolve(resultJson);
                    }
                } else {
                    this.outputChannel.appendErrorLine(
                        resolveI18nTemplate("PQSdk.taskQueue.info.taskExitAbnormally", {
                            operation: pendingTask.operation,
                            pid: `${spawnProcess.pid}`,
                            exitCode: `${processExit.exitCode}`,
                            stdErr: `${processExit.stderr ?? processExit.stdout}`,
                        }),
                    );

                    pendingTask.reject(new PqTestExecutableTaskError(pqTestExeFullPath, processArgs, processExit));
                }
            }
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private doEnqueueOneTask<T = any>(task: PQTestTask): Promise<T> {
        const theTask: PqTestExecutableTask = task as PqTestExecutableTask;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: Promise<T> = new Promise<T>((resolve: (value: T) => void, reject: (reason?: any) => void) => {
            theTask.resolve = resolve;
            theTask.reject = reject;
        });

        this.pendingTasks.push(theTask);

        void this.doCheckPidAndDequeueOneTaskIfAny();

        return result;
    }

    public onPowerQueryTestLocationChanged(): void {
        // PQTestLocation getter
        const nextPQTestLocation: string | undefined = ExtensionConfigurations.PQTestLocation;
        const pqTestExe: string | undefined = this.resolvePQTestPath(nextPQTestLocation);

        if (!pqTestExe || !nextPQTestLocation) {
            this.pqTestReady = false;
            this.pqTestLocation = "";
            this.pqTestFullPath = "";
        } else {
            this.pqTestReady = true;
            this.pqTestLocation = nextPQTestLocation;
            this.pqTestFullPath = pqTestExe;

            this.outputChannel.appendInfoLine(
                resolveI18nTemplate("PQSdk.taskQueue.info.pqtest.found", {
                    pqTestFullPath: this.pqTestFullPath,
                }),
            );

            // check whether it were the first time being ready for the current maybe existing workspace
            if (this.firstTimeReady) {
                // and we also need to ensure we got a valid pq connector mez file
                const currentPQTestExtensionFileLocation: string | undefined =
                    ExtensionConfigurations.DefaultExtensionLocation;

                const resolvedPQTestExtensionFileLocation: string | undefined = currentPQTestExtensionFileLocation
                    ? resolveSubstitutedValues(currentPQTestExtensionFileLocation)
                    : undefined;

                if (resolvedPQTestExtensionFileLocation && fs.existsSync(resolvedPQTestExtensionFileLocation)) {
                    // trigger one display extension info task to populate modules in the pq-lang ext
                    void this.DisplayExtensionInfo();
                }

                this.firstTimeReady = false;
            }

            // if no running pid found, dequeue and execute one pending tasks if any

            void this.doCheckPidAndDequeueOneTaskIfAny();
        }
    }

    protected onPQTestExecutablePidChanged(event: WatchEventType, _filename: string | Buffer | null): void {
        if (event === "change") {
            // it might be the pid changed
            // if no running pid found, dequeue and execute one pending tasks if any
            const pidNumber: number | undefined = this.doSeizePQTestPidFromLockFile();

            if (typeof pidNumber === "number") {
                // noop, but emit an event
                this.eventBus.emit(PqTestExecutableTaskQueueEvents.processCreated);
            } else {
                this.eventBus.emit(PqTestExecutableTaskQueueEvents.processExited);

                // alright we can queue another task
                void this.doCheckPidAndDequeueOneTaskIfAny();
            }
        } else if (event === "rename") {
            // create a new one and watch it
            this.doSetupAndWatchPQTestExecutablePidLockFile();
        }
    }

    ExecuteBuildTaskAndAwaitIfNeeded(): Promise<void> {
        return executeBuildTaskAndAwaitIfNeeded(
            this.pqTestLocation,
            this.lastPqRelatedFileTouchedDate,
            (nextLastPqRelatedFileTouchedDate: Date) => {
                this.lastPqRelatedFileTouchedDate = nextLastPqRelatedFileTouchedDate;
            },
        );
    }

    public DeleteCredential(): Promise<GenericResult> {
        return this.doEnqueueOneTask<GenericResult>({
            operation: "delete-credential",
            additionalArgs: [`--ALL`],
        });
    }

    public DisplayExtensionInfo(): Promise<ExtensionInfo[]> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return this.doEnqueueOneTask<any>({
            operation: "info",
            pathToConnector: resolveSubstitutedValues(ExtensionConfigurations.DefaultExtensionLocation),
        });
    }

    public ListCredentials(): Promise<Credential[]> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return this.doEnqueueOneTask<any[]>({
            operation: "list-credential",
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public GenerateCredentialTemplate(): Promise<any[]> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return this.doEnqueueOneTask<any>({
            operation: "credential-template",
            // additionalArgs: [`--authentication-kind ${authenticationKind}`],
            pathToConnector: resolveSubstitutedValues(ExtensionConfigurations.DefaultExtensionLocation),
            pathToQueryFile: resolveSubstitutedValues(ExtensionConfigurations.DefaultQueryFileLocation),
        });
    }

    public SetCredential(payloadStr: string): Promise<GenericResult> {
        return this.doEnqueueOneTask<GenericResult>({
            operation: "set-credential",
            // additionalArgs: [`${JSON.stringify(payload)}`],
            pathToConnector: resolveSubstitutedValues(ExtensionConfigurations.DefaultExtensionLocation),
            pathToQueryFile: resolveSubstitutedValues(ExtensionConfigurations.DefaultQueryFileLocation),
            stdinStr: payloadStr,
        });
    }

    public SetCredentialFromCreateAuthState(createAuthState: CreateAuthState): Promise<GenericResult> {
        // it feels like set-credential task has to wait for the std input
        let payloadStr: string | undefined = undefined;

        let additionalArgs: string[] | undefined = [];
        let theAuthKind: string = createAuthState.AuthenticationKind;

        if (theAuthKind.toLowerCase() === "key") {
            /* eslint-disable @typescript-eslint/no-non-null-assertion*/
            payloadStr = `{
                "AuthenticationKind": "Key",
                "AuthenticationProperties": {
                    "Key": "${createAuthState.$$KEY$$!}"
                },
                "PrivacySetting": "None",
                "Permissions": []
            }`;
            /* eslint-enable*/
        } else if (theAuthKind.toLowerCase() === "usernamepassword") {
            /* eslint-disable @typescript-eslint/no-non-null-assertion*/
            payloadStr = `{
                "AuthenticationKind": "UsernamePassword",
                "AuthenticationProperties": {
                    "Username": "${createAuthState.$$USERNAME$$!}",
                    "Password": "${createAuthState.$$PASSWORD$$!}"
                },
                "PrivacySetting": "None",
                "Permissions": []
            }`;
            /* eslint-enable*/
        } else if (theAuthKind.toLowerCase() === "oauth" || theAuthKind.toLowerCase() === "aad") {
            additionalArgs.unshift("--interactive");
        } else if (theAuthKind.toLowerCase() === "implicit" || theAuthKind.toLowerCase() === "anonymous") {
            theAuthKind = "Anonymous";

            payloadStr = `{
                "AuthenticationKind": "Anonymous",
                "AuthenticationProperties": {},
                "PrivacySetting": "None",
                "Permissions": []
            }`;
        } else if (theAuthKind.toLowerCase() === "windows") {
            payloadStr = `{
                "AuthenticationKind": "Windows",
                "AuthenticationProperties": {},
                "PrivacySetting": "None",
                "Permissions": []
            }`;
        }

        if (payloadStr === undefined) {
            // AuthenticationKind must be specified if it's not provided in the json input
            additionalArgs.unshift(`${theAuthKind}`);
            additionalArgs.unshift(`-ak`);
        }

        // in case latter we turn additionalArgs an empty array, we should set it undefined at that moment
        if (Array.isArray(additionalArgs) && additionalArgs.length === 0) {
            additionalArgs = undefined;
        }

        return this.doEnqueueOneTask<GenericResult>({
            operation: "set-credential",
            additionalArgs,
            pathToConnector:
                createAuthState.PathToConnectorFile ||
                resolveSubstitutedValues(ExtensionConfigurations.DefaultExtensionLocation),
            pathToQueryFile: resolveSubstitutedValues(createAuthState.PathToQueryFile),
            stdinStr: payloadStr,
        });
    }

    public RefreshCredential(): Promise<GenericResult> {
        return this.doEnqueueOneTask<GenericResult>({
            operation: "refresh-credential",
            pathToConnector: resolveSubstitutedValues(ExtensionConfigurations.DefaultExtensionLocation),
            pathToQueryFile: resolveSubstitutedValues(ExtensionConfigurations.DefaultQueryFileLocation),
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public async RunTestBattery(pathToQueryFile: string = ""): Promise<any> {
        // maybe we need to execute the build task before evaluating.
        await this.ExecuteBuildTaskAndAwaitIfNeeded();

        const activeTextEditor: TextEditor | undefined = vscode.window.activeTextEditor;

        const configPQTestQueryFileLocation: string | undefined = resolveSubstitutedValues(
            ExtensionConfigurations.DefaultQueryFileLocation,
        );

        // todo maybe we could export this lang id to from the lang svc extension
        if (!pathToQueryFile && activeTextEditor?.document.languageId === "powerquery") {
            pathToQueryFile = activeTextEditor.document.uri.fsPath;
        }

        if (!pathToQueryFile && configPQTestQueryFileLocation) {
            pathToQueryFile = configPQTestQueryFileLocation;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return this.doEnqueueOneTask<any>({
            operation: "run-test",
            pathToConnector: resolveSubstitutedValues(ExtensionConfigurations.DefaultExtensionLocation),
            pathToQueryFile,
        });
    }

    public async TestConnection(): Promise<GenericResult> {
        // maybe we need to execute the build task before evaluating.
        await this.ExecuteBuildTaskAndAwaitIfNeeded();

        return this.doEnqueueOneTask<GenericResult>({
            operation: "test-connection",
            pathToConnector: resolveSubstitutedValues(ExtensionConfigurations.DefaultExtensionLocation),
            pathToQueryFile: resolveSubstitutedValues(ExtensionConfigurations.DefaultQueryFileLocation),
        });
    }
}

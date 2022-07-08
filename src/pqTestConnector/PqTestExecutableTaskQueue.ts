/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import {
    buildPqTestArgs,
    CreateAuthState,
    Credential,
    ExtensionInfo,
    GenericResult,
    IPQTestService,
} from "common/PQTestService";
import { Disposable, IDisposable } from "common/Disposable";
import { DisposableEventEmitter, ExtractEventTypes } from "common/DisposableEventEmitter";
import { ExtensionContext, TextEditor } from "vscode";
import { FSWatcher, WatchEventType } from "fs";
import { GlobalEventBus, GlobalEvents } from "GlobalEventBus";
import { ProcessExit, SpawnedProcess } from "common/SpawnedProcess";
import { PqSdkOutputChannel } from "features/PqSdkOutputChannel";
import { ValueEventEmitter } from "common/ValueEventEmitter";

import { convertStringToInteger } from "utils/numbers";
import { pidIsRunning } from "utils/pids";
import { resolveSubstitutedValues } from "utils/vscodes";

import { ChildProcess } from "child_process";
import { ExtensionConfigurations } from "constants/PowerQuerySdkConfiguration";
import { PQTestTask } from "common/PowerQueryTask";

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
        super(`Failed to execute ${pqTestExeFullPath} ${processArgs.join(" ")}`);
        this.processExit = processExit;
    }
}

export class PqTestExecutableTaskQueue implements IPQTestService, IDisposable {
    public static readonly ExecutableName: string = "pqtest.exe";
    public static readonly ExecutablePidLockFileName: string = "pqTest.pid";

    private readonly eventBus: DisposableEventEmitter<PqTestExecutableTaskQueueEventTypes>;
    private readonly pidLockFileLocation: string;
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
            this.outputChannel.appendErrorLine("powerquery.sdk.pqtest.location configuration value is not set.");

            return undefined;
        } else if (!fs.existsSync(nextPQTestLocation)) {
            this.outputChannel.appendErrorLine(
                `powerquery.sdk.pqtest.location set to '${nextPQTestLocation}' but directory does not exist.`,
            );

            return undefined;
        }

        const pqtestExe: string = path.resolve(nextPQTestLocation, PqTestExecutableTaskQueue.ExecutableName);

        if (!fs.existsSync(pqtestExe)) {
            this.outputChannel.appendErrorLine(`pqtest.exe not found at ${pqtestExe}`);

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
                this.outputChannel.appendInfoLine(`[Task found] ${pqTestExeFullPath} ${processArgs.join(" ")}`);

                const spawnProcess: SpawnedProcess = new SpawnedProcess(
                    pqTestExeFullPath,
                    processArgs,
                    { cwd: this.pqTestLocation },
                    {
                        stdinStr: pendingTask.stdinStr,
                        onSpawned: (childProcess: ChildProcess): void => {
                            this.doWritePid(`${childProcess.pid}` ?? "nan");

                            this.outputChannel.appendTraceLine(
                                `[Task began] Fork pqtask ${pendingTask.operation} executable of pid: ${childProcess.pid}`,
                            );
                        },
                    },
                );

                const processExit: ProcessExit = await spawnProcess.deferred$;
                this.doWritePid("");

                this.outputChannel.appendTraceLine(
                    `[Task finished] Forked pqtask ${pendingTask.operation} executable pid(${spawnProcess.pid}) exited.`,
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

                    if (pendingTask.operation === "info") {
                        this.currentExtensionInfos.emit(resultJson);
                    } else if (pendingTask.operation === "list-credential") {
                        this.currentCredentials.emit(resultJson);
                    }

                    pendingTask.resolve(resultJson);
                } else {
                    this.outputChannel.appendErrorLine(`[Task exited abnormally] pqtest ${pendingTask.operation} pid(${
                        spawnProcess.pid
                    }) exit(${processExit.exitCode})
\t\t\t\t stderr: ${processExit.stderr || processExit.stdout}`);

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
            this.outputChannel.appendInfoLine(`pqtest.exe found at ${this.pqTestFullPath}`);
            // if no running pid found, dequeue and execute one pending tasks if any

            void this.doCheckPidAndDequeueOneTaskIfAny();
        }
    }

    protected onPQTestExecutablePidChanged(event: WatchEventType, _filename: string): void {
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

    public DeleteCredential(): Promise<GenericResult> {
        return this.doEnqueueOneTask<GenericResult>({
            operation: "delete-credential",
            additionalArgs: [`--ALL`],
        });
    }

    public DisplayExtensionInfo(): Promise<ExtensionInfo> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return this.doEnqueueOneTask<any>({
            operation: "info",
            pathToConnector: resolveSubstitutedValues(ExtensionConfigurations.PQTestExtensionFileLocation),
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
            pathToConnector: resolveSubstitutedValues(ExtensionConfigurations.PQTestExtensionFileLocation),
            pathToQueryFile: resolveSubstitutedValues(ExtensionConfigurations.PQTestQueryFileLocation),
        });
    }

    public SetCredential(payloadStr: string): Promise<GenericResult> {
        return this.doEnqueueOneTask<GenericResult>({
            operation: "set-credential",
            // additionalArgs: [`${JSON.stringify(payload)}`],
            pathToConnector: resolveSubstitutedValues(ExtensionConfigurations.PQTestExtensionFileLocation),
            pathToQueryFile: resolveSubstitutedValues(ExtensionConfigurations.PQTestQueryFileLocation),
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
        } else if (theAuthKind.toLowerCase() === "oauth2") {
            payloadStr = `{
                "AuthenticationKind": "OAuth2",
                "AuthenticationProperties": {},
                "PrivacySetting": "None",
                "Permissions": []
            }`;

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
        } else if (theAuthKind.toLowerCase() === "aad") {
            payloadStr = `{
                "AuthenticationKind": "Aad",
                "AuthenticationProperties": {},
                "PrivacySetting": "None",
                "Permissions": []
            }`;
        }

        additionalArgs.unshift(`${theAuthKind}`);
        additionalArgs.unshift(`-ak`);

        // additionalArgs.unshift(`-dsk=${createAuthState.DataSourceKind}`);

        // in case latter we turn additionalArgs an empty array, we should set it undefined at that moment
        if (Array.isArray(additionalArgs) && additionalArgs.length === 0) {
            additionalArgs = undefined;
        }

        return this.doEnqueueOneTask<GenericResult>({
            operation: "set-credential",
            additionalArgs,
            pathToConnector: resolveSubstitutedValues(ExtensionConfigurations.PQTestExtensionFileLocation),
            pathToQueryFile: resolveSubstitutedValues(createAuthState.PathToQueryFile),
            stdinStr: payloadStr,
        });
    }

    public RefreshCredential(): Promise<GenericResult> {
        return this.doEnqueueOneTask<GenericResult>({
            operation: "refresh-credential",
            pathToConnector: resolveSubstitutedValues(ExtensionConfigurations.PQTestExtensionFileLocation),
            pathToQueryFile: resolveSubstitutedValues(ExtensionConfigurations.PQTestQueryFileLocation),
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public RunTestBattery(pathToQueryFile: string = ""): Promise<any> {
        const activeTextEditor: TextEditor | undefined = vscode.window.activeTextEditor;

        const configPQTestQueryFileLocation: string | undefined = resolveSubstitutedValues(
            ExtensionConfigurations.PQTestQueryFileLocation,
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
            pathToConnector: resolveSubstitutedValues(ExtensionConfigurations.PQTestExtensionFileLocation),
            pathToQueryFile,
        });
    }

    public TestConnection(): Promise<GenericResult> {
        return this.doEnqueueOneTask<GenericResult>({
            operation: "test-connection",
            pathToConnector: resolveSubstitutedValues(ExtensionConfigurations.PQTestExtensionFileLocation),
            pathToQueryFile: resolveSubstitutedValues(ExtensionConfigurations.PQTestQueryFileLocation),
        });
    }
}

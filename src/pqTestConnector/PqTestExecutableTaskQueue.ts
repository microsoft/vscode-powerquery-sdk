/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as fs from "fs";
import * as path from "path";
import { FSWatcher, WatchEventType } from "fs";
import * as vscode from "vscode";
import { ExtensionContext, TextEditor } from "vscode";
import { GlobalEventBus, GlobalEvents } from "GlobalEventBus";
import { ExtensionConfigurations } from "constants/PowerQuerySdkConfiguration";
import { SpawnedProcess, ProcessExit } from "common/SpawnedProcess";
import { IDisposable, Disposable } from "common/Disposable";
import { buildPqTestArgs, PQTestTaskBase, IPQTestService, GenericResult } from "common/PQTestService";
import { PqSdkOutputChannel } from "features/PqSdkOutputChannel";
import { pidIsRunning } from "utils/pids";
import { convertStringToInteger } from "utils/numbers";
import { ExtractEventTypes, DisposableEventEmitter } from "common/DisposableEventEmitter";
import { resolveSubstitutedValues } from "utils/vscodes";

// eslint-disable-next-line @typescript-eslint/typedef
export const PqTestExecutableTaskQueueEvents = {
    processCreated: Symbol.for("PqTestExecutable.processCreated"),
    processExited: Symbol.for("PqTestExecutable.processExited"),
};
type PqTestExecutableTaskQueueEventTypes = ExtractEventTypes<typeof PqTestExecutableTaskQueueEvents>;

/**
 * Internal interface within the module, we need not cast members as readonly
 */
interface PqTestExecutableTask extends PQTestTaskBase {
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
    static readonly ExecutableName = "pqtest.exe";
    static readonly ExecutablePidLockFileName = "pqTest.pid";

    private readonly eventBus: DisposableEventEmitter<PqTestExecutableTaskQueueEventTypes>;
    private onPQTestExecutablePidChangedFsWatcher: FSWatcher | undefined = undefined;
    private pendingTasks: PqTestExecutableTask[] = [];
    protected _disposables: Array<IDisposable> = [];
    pqTestReady: boolean = false;
    pqTestLocation: string = "";
    pqTestFullPath: string = "";
    readonly pidLockFileLocation: string;

    public subscribeOneEvent: (
        eventName: PqTestExecutableTaskQueueEventTypes,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        listener: (...args: any[]) => void,
    ) => IDisposable;

    constructor(
        private readonly vscExtCtx: ExtensionContext,
        private readonly globalEventBus: GlobalEventBus,
        private readonly outputChannel: PqSdkOutputChannel,
    ) {
        // init instance fields
        this.eventBus = new DisposableEventEmitter();
        this.subscribeOneEvent = this.eventBus.subscribeOneEvent.bind(this.eventBus);
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
                GlobalEvents.VSCodeEvents.ConfigDidChangePowerQuerySDK,
                this.onPowerQuerySDKChanged.bind(this),
            ),
        );
        this.onPowerQuerySDKChanged();
    }

    public dispose = (): void => {
        for (const oneDisposable of this._disposables) {
            oneDisposable.dispose();
        }
    };

    private calculatePQTestPath(nextPQTestLocation: string | undefined): string | undefined {
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

    private doSeizePQTestPidOfLockFile(thePidFileLocation: string = this.pidLockFileLocation): number | undefined {
        const pidString: string = fs.readFileSync(thePidFileLocation).toString("utf8");
        const result: number | undefined = convertStringToInteger(pidString);
        if (typeof result === "number") {
            this.outputChannel.appendTraceLine(`Read existing pqTest pid file content: ${pidString}, ${result}`);
        } else {
            this.outputChannel.appendTraceLine(`Read non-existing pqTest pid file. ${result}`);
        }
        return result;
    }

    private doWritePid(pid: string) {
        fs.writeFileSync(this.pidLockFileLocation, pid);
    }

    private doSetupAndWatchPQTestExecutablePidLockFile(curPid: string = "") {
        // create or wipe pidLockFile
        if (!fs.existsSync(this.pidLockFileLocation)) {
            this.doWritePid(curPid);
            this.outputChannel.appendTraceLine(`Create empty pqTest pid file: ${this.pidLockFileLocation}`);
        } else {
            const pidNumber: number | undefined = this.doSeizePQTestPidOfLockFile();
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

    private async doCheckPidAndDequeueOneTaskIfAny() {
        const pidNumber: number | undefined = this.doSeizePQTestPidOfLockFile();
        if (typeof pidNumber !== "number" && this.pqTestFullPath) {
            // alright we can queue another task
            const pendingTask: PqTestExecutableTask | undefined = this.pendingTasks.shift();
            if (pendingTask) {
                // do fork one process and execute the task
                const pqTestExeFullPath: string = this.pqTestFullPath;
                const processArgs: string[] = buildPqTestArgs(pendingTask);
                this.outputChannel.appendTraceLine(`[Task found] ${pqTestExeFullPath} ${processArgs.join(" ")}`);
                const spawnProcess: SpawnedProcess = new SpawnedProcess(
                    pqTestExeFullPath,
                    processArgs,
                    { cwd: this.pqTestLocation },
                    {
                        stdinStr: pendingTask.stdinStr,
                        onSpawned: childProcess => {
                            this.doWritePid("" + childProcess.pid ?? "nan");
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
                    // todo try catch the JSON parse
                    pendingTask.resolve(JSON.parse(spawnProcess.stdOut));
                } else {
                    this.outputChannel.appendErrorLine(`[Task exited abnormally] pqtest ${pendingTask.operation} pid(${
                        spawnProcess.pid
                    }) exit(${processExit.exitCode})
\t\t\t\t stderr: ${processExit.stderr ?? processExit.stdout}`);
                    pendingTask.reject(new PqTestExecutableTaskError(pqTestExeFullPath, processArgs, processExit));
                }
            }
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private doEnqueueOneTask<T = any>(task: PQTestTaskBase) {
        const theTask: PqTestExecutableTask = task as PqTestExecutableTask;
        const result: Promise<T> = new Promise<T>((resolve, reject) => {
            theTask.resolve = resolve;
            theTask.reject = reject;
        });
        this.pendingTasks.push(theTask);
        this.doCheckPidAndDequeueOneTaskIfAny();
        return result;
    }

    protected onPowerQuerySDKChanged() {
        // PQTestLocation getter
        const nextPQTestLocation: string | undefined = ExtensionConfigurations.PQTestLocation;
        const pqTestExe: string | undefined = this.calculatePQTestPath(nextPQTestLocation);
        if (!pqTestExe) {
            this.pqTestReady = false;
            this.pqTestLocation = "";
            this.pqTestFullPath = "";
        } else {
            this.pqTestReady = true;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.pqTestLocation = nextPQTestLocation!;
            this.pqTestFullPath = pqTestExe;
            this.outputChannel.appendTraceLine(`pqtest.exe found at ${this.pqTestFullPath}`);
            // if no running pid found, dequeue and execute one pending tasks if any
            this.doCheckPidAndDequeueOneTaskIfAny();
        }
    }

    protected onPQTestExecutablePidChanged(event: WatchEventType, _filename: string) {
        if (event === "change") {
            // it might be the pid changed
            // if no running pid found, dequeue and execute one pending tasks if any
            const pidNumber: number | undefined = this.doSeizePQTestPidOfLockFile();
            if (typeof pidNumber === "number") {
                // noop, but emit an event
                this.eventBus.emit(PqTestExecutableTaskQueueEvents.processCreated);
            } else {
                this.eventBus.emit(PqTestExecutableTaskQueueEvents.processExited);
                // alright we can queue another task
                this.doCheckPidAndDequeueOneTaskIfAny();
            }
        } else if (event === "rename") {
            // create a new one and watch it
            this.doSetupAndWatchPQTestExecutablePidLockFile();
        }
    }

    public async DeleteCredential() {
        return this.doEnqueueOneTask<GenericResult>({
            operation: "delete-credential",
            additionalArgs: [`--ALL`],
        });
    }

    public async DisplayExtensionInfo() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return this.doEnqueueOneTask<any>({
            operation: "info",
            pathToConnector: resolveSubstitutedValues(ExtensionConfigurations.PQTestExtensionFileLocation),
        });
    }

    public async ListCredentials() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return this.doEnqueueOneTask<any[]>({
            operation: "list-credential",
        });
    }

    public async GenerateCredentialTemplate() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return this.doEnqueueOneTask<any>({
            operation: "credential-template",
            // additionalArgs: [`--authentication-kind ${authenticationKind}`],
            pathToConnector: resolveSubstitutedValues(ExtensionConfigurations.PQTestExtensionFileLocation),
            pathToQueryFile: resolveSubstitutedValues(ExtensionConfigurations.PQTestQueryFileLocation),
        });
    }

    public SetCredential(payloadStr: string) {
        return this.doEnqueueOneTask<GenericResult>({
            operation: "set-credential",
            // additionalArgs: [`${JSON.stringify(payload)}`],
            pathToConnector: resolveSubstitutedValues(ExtensionConfigurations.PQTestExtensionFileLocation),
            pathToQueryFile: resolveSubstitutedValues(ExtensionConfigurations.PQTestQueryFileLocation),
            stdinStr: payloadStr,
        });
    }

    public RefreshCredential() {
        return this.doEnqueueOneTask<GenericResult>({
            operation: "refresh-credential",
            pathToConnector: resolveSubstitutedValues(ExtensionConfigurations.PQTestExtensionFileLocation),
            pathToQueryFile: resolveSubstitutedValues(ExtensionConfigurations.PQTestQueryFileLocation),
        });
    }

    public RunTestBattery(pathToQueryFile: string = "") {
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

    public TestConnection() {
        return this.doEnqueueOneTask<GenericResult>({
            operation: "test-connection",
            pathToConnector: resolveSubstitutedValues(ExtensionConfigurations.PQTestExtensionFileLocation),
            pathToQueryFile: resolveSubstitutedValues(ExtensionConfigurations.PQTestQueryFileLocation),
        });
    }
}

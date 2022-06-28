/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import { DisposableEventEmitter, ExtractEventTypes } from "common/DisposableEventEmitter";
import { ProcessExit, SpawnedProcess } from "common/SpawnedProcess";
import { buildPqTestArgs } from "common/PQTestService";
import { ChildProcessWithoutNullStreams } from "child_process";
import { ExtensionConfigurations } from "constants/PowerQuerySdkConfiguration";
import { IDisposable } from "common/Disposable";
import { PqTestResultViewPanel } from "panels/PqTestResultViewPanel";
import { PQTestTask } from "common/PowerQueryTask";
import { resolveSubstitutedValues } from "utils/vscodes";

// eslint-disable-next-line @typescript-eslint/typedef
export const PqTestExecutableOnceTaskQueueEvents = {
    processCreated: "PqTestExecutable.processCreated" as const,
    processExited: "PqTestExecutable.processExited" as const,
    onOutput: "PqTestExecutable.onOutput" as const,
};
type PqTestExecutableOnceTaskEventTypes = ExtractEventTypes<typeof PqTestExecutableOnceTaskQueueEvents>;

export class PqTestExecutableOnceTask implements IDisposable {
    public static readonly ExecutableName: string = "pqtest.exe";

    // threadId
    private _threadId: number = NaN;
    public get threadId(): number {
        return this._threadId;
    }
    private _pathToQueryFile?: string;
    public get pathToQueryFile(): string {
        return this._pathToQueryFile ?? "";
    }

    public readonly eventBus: DisposableEventEmitter<PqTestExecutableOnceTaskEventTypes>;
    protected _disposables: Array<IDisposable> = [];

    constructor() {
        this.eventBus = new DisposableEventEmitter();
        this._disposables.unshift(this.eventBus);
    }

    private handleTaskCreated(): void {
        setTimeout(() => {
            this.eventBus.emit(PqTestExecutableOnceTaskQueueEvents.processCreated);
        }, 0);
    }

    private handleTaskExited(): void {
        setTimeout(() => {
            this.eventBus.emit(PqTestExecutableOnceTaskQueueEvents.processExited);
        }, 0);
    }

    private handleOutputStr(outputStr: string): void {
        setTimeout(() => {
            this.eventBus.emit(PqTestExecutableOnceTaskQueueEvents.onOutput, "stdOutput", outputStr);
        }, 0);
    }

    private handleErrorStr(errorStr: string): void {
        setTimeout(() => {
            this.eventBus.emit(PqTestExecutableOnceTaskQueueEvents.onOutput, "stdError", errorStr);
        }, 0);
    }

    private get pqTestFullPath(): string {
        // PQTestLocation getter
        const nextPQTestLocation: string | undefined = ExtensionConfigurations.PQTestLocation;

        if (!nextPQTestLocation) {
            this.handleErrorStr("powerquery.sdk.pqtest.location configuration value is not set.");
            throw new Error("Failed to find PqTest executable");
        } else if (!fs.existsSync(nextPQTestLocation)) {
            this.handleErrorStr(
                `powerquery.sdk.pqtest.location set to '${nextPQTestLocation}' but directory does not exist.`,
            );

            throw new Error("Failed to find PqTest executable");
        }

        const pqtestExe: string = path.resolve(nextPQTestLocation, PqTestExecutableOnceTask.ExecutableName);

        if (!fs.existsSync(pqtestExe)) {
            this.handleErrorStr(`pqtest.exe not found at ${pqtestExe}`);
            throw new Error("Failed to find PqTest executable");
        }

        return pqtestExe;
    }

    private populateTestTaskPayload(program: string, task: PQTestTask): PQTestTask {
        let result: PQTestTask = task;

        // even though not all operations would be run within this OnceTask, it makes no harm we support them all
        switch (task.operation) {
            case "info":
                result = {
                    ...result,
                    pathToConnector: resolveSubstitutedValues(ExtensionConfigurations.PQTestExtensionFileLocation),
                };

                break;
            case "credential-template":
            case "set-credential":
            case "refresh-credential":
            case "run-test":
            case "test-connection":
                result = {
                    ...result,
                    pathToConnector: resolveSubstitutedValues(ExtensionConfigurations.PQTestExtensionFileLocation),
                    pathToQueryFile: path.resolve(program),
                };

                break;
            case "list-template":
            case "delete-credential":
            default:
                // noop
                break;
        }

        return result;
    }

    public async run(program: string, task: PQTestTask): Promise<void> {
        try {
            task = this.populateTestTaskPayload(program, task);
            this._pathToQueryFile = task.pathToQueryFile;
            // do fork one process and execute the task
            const pqTestExeFullPath: string = this.pqTestFullPath;
            const processArgs: string[] = buildPqTestArgs(task);

            this.handleTaskCreated();
            this.handleOutputStr(`[Debug task found] ${pqTestExeFullPath} ${processArgs.join(" ")}`);

            const spawnProcess: SpawnedProcess = new SpawnedProcess(
                pqTestExeFullPath,
                processArgs,
                { cwd: path.dirname(pqTestExeFullPath) },
                {
                    stdinStr: task.stdinStr,
                    onSpawned: (childProcess: ChildProcessWithoutNullStreams): void => {
                        this._threadId = childProcess.pid ?? NaN;

                        this.handleOutputStr(
                            `[Debug task began] Fork pqtask ${task.operation} executable of pid: ${childProcess.pid}`,
                        );
                    },
                },
            );

            const processExit: ProcessExit = await spawnProcess.deferred$;

            if (typeof processExit.exitCode === "number" && processExit.exitCode === 0) {
                this.handleOutputStr(spawnProcess.stdOut);

                // dump result to the web view if any result found
                if (task.operation === "run-test") {
                    try {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const result: any = JSON.parse(spawnProcess.stdOut);

                        if (result) {
                            void vscode.commands.executeCommand(
                                PqTestResultViewPanel.UpdateResultWebViewCommand,
                                result,
                            );
                        }
                    } catch (e) {
                        // noop
                    }
                }
            } else {
                this.handleErrorStr(
                    `[Debug task exited abnormally] pqtest ${task.operation} pid(${spawnProcess.pid}) exit(${
                        processExit.exitCode
                    }) stderr: ${processExit.stderr ?? processExit.stdout}`,
                );
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            this.handleErrorStr(typeof err === "string" ? err : err.toString());
        } finally {
            this.handleTaskExited();
        }
    }

    public dispose = (): void => {
        for (const oneDisposable of this._disposables) {
            oneDisposable.dispose();
        }
    };
}

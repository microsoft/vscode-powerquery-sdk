/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import { ChildProcess } from "child_process";

import { DisposableEventEmitter, ExtractEventTypes } from "../common/DisposableEventEmitter";
import { extensionI18n, resolveI18nTemplate } from "../i18n/extension";
import { ProcessExit, SpawnedProcess } from "../common/SpawnedProcess";
import { buildPqTestArgs } from "../common/PQTestService";
import { ExtensionConfigurations } from "../constants/PowerQuerySdkConfiguration";
import { formatArguments } from "./PqTestTaskUtils";
import { IDisposable } from "../common/Disposable";
import { PqTestResultViewPanel } from "../panels/PqTestResultViewPanel";
import { PQTestTask } from "../common/PowerQueryTask";
import { resolveSubstitutedValues } from "../utils/vscodes";

// eslint-disable-next-line @typescript-eslint/typedef
export const PqTestExecutableOnceTaskQueueEvents = {
    processCreated: "PqTestExecutable.processCreated" as const,
    processExited: "PqTestExecutable.processExited" as const,
    onOutput: "PqTestExecutable.onOutput" as const,
};
type PqTestExecutableOnceTaskEventTypes = ExtractEventTypes<typeof PqTestExecutableOnceTaskQueueEvents>;

export class PqTestExecutableOnceTask implements IDisposable {
    public static readonly ExecutableName: string = "PQTest.exe";

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
            this.handleErrorStr(extensionI18n["PQSdk.taskQueue.error.pqtestLocationNotSet"]);
            throw new Error("Failed to find PqTest executable");
        } else if (!fs.existsSync(nextPQTestLocation)) {
            this.handleErrorStr(
                resolveI18nTemplate("PQSdk.taskQueue.error.pqtestLocationDoesntExist", {
                    nextPQTestLocation,
                }),
            );

            throw new Error("Failed to find PqTest executable");
        }

        const pqtestExe: string = path.resolve(nextPQTestLocation, PqTestExecutableOnceTask.ExecutableName);

        if (!fs.existsSync(pqtestExe)) {
            this.handleErrorStr(
                resolveI18nTemplate("PQSdk.taskQueue.error.pqtestExecutableDoesntExist", {
                    pqtestExe,
                }),
            );

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
                    pathToConnector: resolveSubstitutedValues(ExtensionConfigurations.DefaultExtensionLocation),
                };

                break;
            case "credential-template":
            case "set-credential":
            case "refresh-credential":
            case "run-test":
            case "test-connection":
                result = {
                    ...result,
                    pathToConnector: resolveSubstitutedValues(ExtensionConfigurations.DefaultExtensionLocation),
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

            this.handleOutputStr(
                resolveI18nTemplate("PQSdk.taskQueue.info.debugTaskFound", {
                    pqTestExeFullPath,
                    arguments: formatArguments(processArgs),
                }),
            );

            const spawnProcess: SpawnedProcess = new SpawnedProcess(
                pqTestExeFullPath,
                processArgs,
                { cwd: path.dirname(pqTestExeFullPath) },
                {
                    stdinStr: task.stdinStr,
                    onSpawned: (childProcess: ChildProcess): void => {
                        this._threadId = childProcess.pid ?? NaN;

                        this.handleOutputStr(
                            resolveI18nTemplate("PQSdk.taskQueue.info.debugTaskBegan", {
                                operation: task.operation,
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
                    resolveI18nTemplate("PQSdk.taskQueue.info.debugTaskExitAbnormally", {
                        operation: task.operation,
                        pid: `${spawnProcess.pid}`,
                        exitCode: `${processExit.exitCode}`,
                        stdErr: `${processExit.stderr ?? processExit.stdout}`,
                    }),
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

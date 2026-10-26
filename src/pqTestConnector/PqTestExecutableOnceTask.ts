/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { ChildProcess } from "child_process";
import * as path from "path";
import * as vscode from "vscode";

import { IDisposable } from "../common/Disposable";
import { DisposableEventEmitter, ExtractEventTypes } from "../common/DisposableEventEmitter";
import { PQTestTask } from "../common/PowerQueryTask";
import { buildPqTestArgs } from "../common/PQTestService";
import { ProcessExit, SpawnedProcess } from "../common/SpawnedProcess";
import { ExtensionConfigurations } from "../constants/PowerQuerySdkConfiguration";
import { resolveI18nTemplate } from "../i18n/extension";
import { PqTestResultViewPanel } from "../panels/PqTestResultViewPanel";
import { resolvePqTestExecutablePath } from "../utils/pqTestPath";
import { ensurePqTestQueryDocumentsSaved } from "../utils/pqTestQueryDocuments";
import { ensureQueryDocumentSaved } from "../utils/queryDocuments";
import { resolveSubstitutedValues } from "../utils/vscodes";
import { formatArguments, inferAnyGeneralErrorString } from "./PqTestTaskUtils";

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
    private process?: SpawnedProcess;
    private disposed: boolean = false;
    private readonly readinessCancellation: vscode.CancellationTokenSource = new vscode.CancellationTokenSource();

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
            case "run-compare":
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

    public async run(program: string, task: PQTestTask): Promise<unknown> {
        try {
            task = this.populateTestTaskPayload(program, task);
            this._pathToQueryFile = task.pathToQueryFile;
            await ensureQueryDocumentSaved(task.pathToQueryFile);

            const processArgs: string[] = buildPqTestArgs(task);

            if (task.workingDirectory) {
                await ensurePqTestQueryDocumentsSaved(processArgs, task.workingDirectory);
            }

            if (this.disposed) {
                return undefined;
            }

            // do fork one process and execute the task
            const pqTestExeFullPath: string = await resolvePqTestExecutablePath(this.readinessCancellation.token);

            if (this.readinessCancellation.token.isCancellationRequested) {
                return undefined;
            }

            const workingDir: string = task.workingDirectory ?? path.dirname(pqTestExeFullPath);

            await ensurePqTestQueryDocumentsSaved(processArgs, workingDir);

            if (this.disposed) {
                return undefined;
            }

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
                { cwd: workingDir },
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

            this.process = spawnProcess;

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

                        const error: string = inferAnyGeneralErrorString(result);

                        if (error) {
                            this.handleErrorStr(error);

                            return undefined;
                        }

                        if (result) {
                            void vscode.commands.executeCommand(
                                PqTestResultViewPanel.UpdateResultWebViewCommand,
                                result,
                            );
                        }
                    } catch (error: unknown) {
                        this.handleErrorStr(
                            resolveI18nTemplate("PQSdk.taskQueue.error.failedToParseJsonOutput", {
                                error: String(error),
                            }),
                        );
                    }
                }

                // run-compare: Parse and return result for caller
                if (task.operation === "run-compare") {
                    try {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const result: any = JSON.parse(spawnProcess.stdOut);
                        const error: string = inferAnyGeneralErrorString(result);

                        if (error) {
                            this.handleErrorStr(error);

                            return undefined;
                        }

                        return result;
                    } catch (e) {
                        this.handleErrorStr(
                            resolveI18nTemplate("PQSdk.taskQueue.error.failedToParseJsonOutput", {
                                error: `${e}`,
                            }),
                        );

                        return undefined;
                    }
                }

                return undefined; // Default return for successful operations
            } else {
                this.handleErrorStr(
                    resolveI18nTemplate("PQSdk.taskQueue.info.debugTaskExitAbnormally", {
                        operation: task.operation,
                        pid: `${spawnProcess.pid}`,
                        exitCode: `${processExit.exitCode}`,
                        stdErr: `${processExit.stderr ?? processExit.stdout}`,
                    }),
                );

                return undefined; // Default return for failed operations
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            if (!this.readinessCancellation.token.isCancellationRequested) {
                this.handleErrorStr(typeof err === "string" ? err : err.toString());
            }

            return undefined; // Default return for errors
        } finally {
            this.handleTaskExited();
        }
    }

    public dispose = (): void => {
        this.disposed = true;
        this.process?.cpStream?.kill();
        this.readinessCancellation.cancel();
        this.readinessCancellation.dispose();

        for (const oneDisposable of this._disposables) {
            oneDisposable.dispose();
        }
    };
}

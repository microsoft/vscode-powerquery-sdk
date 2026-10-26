/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as path from "path";
import * as vscode from "vscode";

import { PowerQueryTaskDefinition } from "../common/PowerQueryTask";
import { buildPqTestArgs } from "../common/PQTestService";
import { ProcessExit, SpawnedProcess } from "../common/SpawnedProcess";
import { protectManagedToolsLocationAsync } from "../constants/PowerQuerySdkConfiguration";
import { inferAnyGeneralErrorString } from "../pqTestConnector/PqTestTaskUtils";
import { resolvePqTestExecutablePath } from "../utils/pqTestPath";
import { ensurePqTestQueryDocumentsSaved } from "../utils/pqTestQueryDocuments";
import { getFirstWorkspaceFolder } from "../utils/vscodes";

export class PqTestTaskTerminal implements vscode.Pseudoterminal {
    private readonly writeEmitter: vscode.EventEmitter<string> = new vscode.EventEmitter<string>();
    private readonly closeEmitter: vscode.EventEmitter<number> = new vscode.EventEmitter<number>();
    readonly onDidWrite: vscode.Event<string> = this.writeEmitter.event;
    readonly onDidClose: vscode.Event<number> = this.closeEmitter.event;
    private process?: SpawnedProcess;
    private nativeExecution?: vscode.TaskExecution;
    private closed: boolean = false;
    private readonly readinessCancellation: vscode.CancellationTokenSource = new vscode.CancellationTokenSource();

    constructor(
        private readonly definition: PowerQueryTaskDefinition,
        private readonly executablePath?: string,
        private readonly workspaceDirectory?: string,
        private readonly scope: vscode.WorkspaceFolder | vscode.TaskScope = vscode.TaskScope.Workspace,
    ) {}

    async open(_initialDimensions: vscode.TerminalDimensions | undefined): Promise<void> {
        try {
            let executable: string;

            if (this.executablePath) {
                await protectManagedToolsLocationAsync(
                    path.dirname(this.executablePath),
                    this.readinessCancellation.token,
                );

                executable = this.executablePath;
            } else {
                executable = await resolvePqTestExecutablePath(this.readinessCancellation.token);
            }

            if (this.closed) {
                return;
            }

            const workspaceDirectory: string =
                this.workspaceDirectory ?? getFirstWorkspaceFolder()?.uri.fsPath ?? path.dirname(executable);

            const workingDirectory: string = path.resolve(
                workspaceDirectory,
                this.definition.options?.cwd ?? this.definition.workingDirectory ?? workspaceDirectory,
            );

            await ensurePqTestQueryDocumentsSaved(buildPqTestArgs(this.definition), workingDirectory);

            if (this.closed) {
                return;
            }

            if (
                this.definition.stdinStr === undefined &&
                this.definition.credentialTemplate === undefined &&
                (this.definition.additionalArgs?.includes("--interactive") ||
                    (this.definition.operation !== "run-test" &&
                        this.definition.operation !== "test-connection" &&
                        this.definition.operation !== "refresh-credential"))
            ) {
                // Preserve native input and output handling for tasks that only need a save guard.
                this.finish(await this.runNativeTask(executable, workingDirectory));

                return;
            }

            const environment: NodeJS.ProcessEnv = { ...process.env };

            for (const [name, value] of Object.entries(this.definition.options?.env ?? {})) {
                const key: string =
                    process.platform === "win32"
                        ? (Object.keys(environment).find(
                              (candidate: string) => candidate.toLowerCase() === name.toLowerCase(),
                          ) ?? name)
                        : name;

                environment[key] = value;
            }

            this.process = new SpawnedProcess(
                executable,
                buildPqTestArgs(this.definition),
                {
                    cwd: workingDirectory,
                    env: environment,
                    timeout: 0,
                },
                {
                    stdinStr:
                        this.definition.stdinStr ??
                        (this.definition.credentialTemplate
                            ? JSON.stringify(this.definition.credentialTemplate)
                            : undefined),
                    onStdOut: (data: Buffer): void => this.write(data.toString("utf8")),
                    onStdErr: (data: Buffer): void => this.write(data.toString("utf8")),
                },
            );

            const result: ProcessExit = await this.process.deferred$;

            if (result.exitCode === 0 && result.stdout.trim().length > 0) {
                const payload: unknown = JSON.parse(result.stdout);
                const error: string = inferAnyGeneralErrorString(payload);

                if (error) {
                    this.write(`${error}\n`);
                    this.finish(1);

                    return;
                }

                if (
                    Array.isArray(payload) &&
                    payload.some(
                        (item: unknown) =>
                            item !== null && typeof item === "object" && "Status" in item && item.Status === "Failed",
                    )
                ) {
                    this.finish(1);

                    return;
                }
            }

            this.finish(result.exitCode ?? 1);
        } catch (error: unknown) {
            this.write(`${error instanceof Error ? error.message : String(error)}\n`);
            this.finish(1);
        }
    }

    close(): void {
        this.closed = true;
        this.readinessCancellation.cancel();
        this.readinessCancellation.dispose();
        this.process?.cpStream?.kill();
        this.nativeExecution?.terminate();
        this.writeEmitter.dispose();
        this.closeEmitter.dispose();
    }

    handleInput(data: string): void {
        if (data === "\x03") {
            this.finish(130);
        }
    }

    private async runNativeTask(executable: string, workingDirectory: string): Promise<number> {
        const args: string[] = buildPqTestArgs(this.definition);

        const task: vscode.Task = new vscode.Task(
            { type: "process", command: executable, args },
            this.scope,
            this.definition.label ?? this.definition.operation,
            "pqtest",
            new vscode.ProcessExecution(executable, args, { ...this.definition.options, cwd: workingDirectory }),
            [],
        );

        let exitCode: number | undefined;
        const subscriptions: vscode.Disposable[] = [];

        try {
            return await new Promise<number>((resolve: (code: number) => void, reject: (error: unknown) => void) => {
                const matches = (execution: vscode.TaskExecution): boolean =>
                    execution === this.nativeExecution || execution.task === task;

                subscriptions.push(
                    vscode.tasks.onDidEndTaskProcess((event: vscode.TaskProcessEndEvent) => {
                        if (matches(event.execution)) {
                            exitCode = event.exitCode;
                        }
                    }),
                    vscode.tasks.onDidEndTask((event: vscode.TaskEndEvent) => {
                        if (matches(event.execution)) {
                            this.nativeExecution = undefined;
                            resolve(exitCode ?? 1);
                        }
                    }),
                );

                void vscode.tasks.executeTask(task).then((execution: vscode.TaskExecution) => {
                    this.nativeExecution = execution;

                    if (this.closed) {
                        execution.terminate();
                    }
                }, reject);
            });
        } finally {
            subscriptions.forEach((subscription: vscode.Disposable) => subscription.dispose());
        }
    }

    private write(value: string): void {
        if (!this.closed) {
            this.writeEmitter.fire(value.replace(/\r?\n/g, "\r\n"));
        }
    }

    private finish(code: number): void {
        if (!this.closed) {
            this.closeEmitter.fire(code);
            this.close();
        }
    }
}

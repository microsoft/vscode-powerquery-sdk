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
import { executeBuildTaskAndAwaitIfNeeded, inferAnyGeneralErrorString } from "../pqTestConnector/PqTestTaskUtils";
import { resolvePqTestExecutablePath } from "../utils/pqTestPath";
import { ensureQueryDocumentSaved } from "../utils/queryDocuments";

export class PqTestTaskTerminal implements vscode.Pseudoterminal {
    private readonly writeEmitter: vscode.EventEmitter<string> = new vscode.EventEmitter<string>();
    private readonly closeEmitter: vscode.EventEmitter<number> = new vscode.EventEmitter<number>();
    readonly onDidWrite: vscode.Event<string> = this.writeEmitter.event;
    readonly onDidClose: vscode.Event<number> = this.closeEmitter.event;
    private process?: SpawnedProcess;
    private closed: boolean = false;

    constructor(private readonly definition: PowerQueryTaskDefinition) {}

    async open(_initialDimensions: vscode.TerminalDimensions | undefined): Promise<void> {
        try {
            await ensureQueryDocumentSaved(this.definition.pathToQueryFile);

            if (this.closed) {
                return;
            }

            const executable: string = resolvePqTestExecutablePath();

            if (this.definition.operation === "run-test" || this.definition.operation === "test-connection") {
                await executeBuildTaskAndAwaitIfNeeded(path.dirname(executable));
            }

            if (this.closed) {
                return;
            }

            await ensureQueryDocumentSaved(this.definition.pathToQueryFile);

            if (this.closed) {
                return;
            }

            this.process = new SpawnedProcess(
                executable,
                buildPqTestArgs(this.definition),
                { cwd: this.definition.workingDirectory ?? path.dirname(executable), timeout: 0 },
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

            if (result.exitCode === 0) {
                const error: string = inferAnyGeneralErrorString(JSON.parse(result.stdout));

                if (error) {
                    this.write(`${error}\n`);
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
        this.process?.cpStream?.kill();
        this.writeEmitter.dispose();
        this.closeEmitter.dispose();
    }

    handleInput(data: string): void {
        if (data === "\x03") {
            this.finish(130);
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

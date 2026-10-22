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
import { inferAnyGeneralErrorString } from "../pqTestConnector/PqTestTaskUtils";
import { resolvePqTestExecutablePath } from "../utils/pqTestPath";
import { ensureQueryDocumentSaved } from "../utils/queryDocuments";
import { getFirstWorkspaceFolder } from "../utils/vscodes";

export class PqTestTaskTerminal implements vscode.Pseudoterminal {
    private readonly writeEmitter: vscode.EventEmitter<string> = new vscode.EventEmitter<string>();
    private readonly closeEmitter: vscode.EventEmitter<number> = new vscode.EventEmitter<number>();
    readonly onDidWrite: vscode.Event<string> = this.writeEmitter.event;
    readonly onDidClose: vscode.Event<number> = this.closeEmitter.event;
    private process?: SpawnedProcess;
    private closed: boolean = false;

    constructor(
        private readonly definition: PowerQueryTaskDefinition,
        private readonly executablePath?: string,
        private readonly workspaceDirectory?: string,
    ) {}

    async open(_initialDimensions: vscode.TerminalDimensions | undefined): Promise<void> {
        try {
            const executable: string = this.executablePath ?? resolvePqTestExecutablePath();

            const workingDirectory: string =
                this.definition.workingDirectory ??
                this.workspaceDirectory ??
                getFirstWorkspaceFolder()?.uri.fsPath ??
                path.dirname(executable);

            const queryFile: string | undefined = this.definition.pathToQueryFile
                ? path.resolve(workingDirectory, this.definition.pathToQueryFile)
                : undefined;

            await ensureQueryDocumentSaved(queryFile);

            if (this.closed) {
                return;
            }

            this.process = new SpawnedProcess(
                executable,
                buildPqTestArgs(this.definition),
                { cwd: workingDirectory, timeout: 0 },
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

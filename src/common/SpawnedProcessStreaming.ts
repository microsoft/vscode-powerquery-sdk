/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as cp from "child_process";
import { ChildProcess } from "child_process";
import * as stream from "stream";
import * as vscode from "vscode";

import { PqSdkOutputChannel } from "../features/PqSdkOutputChannel";
import { extensionI18n, resolveI18nTemplate } from "../i18n/extension";

/**
 * Options for configuring the streaming process execution.
 */
export interface StreamingProcessOptions {
    /** Working directory for the process */
    cwd?: string;
    /** Output channel for logging stderr and diagnostic info */
    outputChannel?: PqSdkOutputChannel;
    /** Cancellation token for process termination */
    cancellationToken?: vscode.CancellationToken;
}

/**
 * Spawns a process and provides streaming access to its stdout.
 *
 * Unlike SpawnedProcess (which buffers all output), this class provides
 * real-time access to the output stream for line-by-line processing.
 */
export class SpawnedProcessStreaming {
    constructor(
        private readonly exePath: string,
        private readonly args: string[],
        private readonly options?: StreamingProcessOptions,
    ) {}

    /**
     * Spawns the process and returns a promise that resolves with the stdout stream.
     *
     * The promise rejects if:
     * - Process fails to spawn (e.g., executable not found)
     * - Process exits with non-zero code before producing stdout
     * - Process is cancelled via cancellation token
     *
     * Once stdout starts flowing, the promise resolves with the stream.
     * The caller is responsible for handling the stream and any subsequent errors.
     *
     * @returns Promise<NodeJS.ReadableStream> - stdout stream for line-by-line parsing
     * @throws Error if process fails to start or exits with error before stdout
     */
    async run(): Promise<NodeJS.ReadableStream> {
        return new Promise((resolve: (value: NodeJS.ReadableStream) => void, reject: (reason?: Error) => void) => {
            // Log command execution
            const commandLine: string = `${this.exePath} ${this.args.join(" ")}`;

            this.options?.outputChannel?.appendDebugLine(
                resolveI18nTemplate("PQSdk.testAdapter.executingCommand", { commandLine }),
            );

            if (this.options?.cwd) {
                this.options.outputChannel?.appendDebugLine(
                    resolveI18nTemplate("PQSdk.testAdapter.workingDirectory", {
                        directory: this.options.cwd,
                    }),
                );
            }

            // Spawn process
            const childProcess: ChildProcess = cp.spawn(this.exePath, this.args, {
                cwd: this.options?.cwd,
            });

            let stderrData: string = "";
            let stdoutResolved: boolean = false;

            // Create a PassThrough stream to ensure no data is lost
            // This pattern is critical for concurrent process execution where the first
            // stdout chunk might arrive before the readline interface is set up
            const passThroughStream: stream.PassThrough = new stream.PassThrough();

            // Collect and log stderr in real-time
            childProcess.stderr?.on("data", (data: Buffer) => {
                const message: string = data.toString();
                stderrData += message;

                this.options?.outputChannel?.appendLine(
                    resolveI18nTemplate("PQSdk.testAdapter.stderrOutput", { message }),
                );
            });

            // Handle cancellation
            this.options?.cancellationToken?.onCancellationRequested(() => {
                childProcess.kill();
                const errorMsg: string = extensionI18n["PQSdk.testAdapter.processCancelled"];
                this.options?.outputChannel?.appendLine(errorMsg);
                reject(new Error(errorMsg));
            });

            // Handle spawn errors (e.g., executable not found)
            childProcess.on("error", (err: Error) => {
                const errorMsg: string = resolveI18nTemplate("PQSdk.testAdapter.failedToStartProcess", {
                    error: err.message,
                });

                this.options?.outputChannel?.appendErrorLine(errorMsg);
                reject(new Error(errorMsg));
            });

            // Handle process exit
            childProcess.on("exit", (code: number | null, _signal: NodeJS.Signals | null) => {
                // Only reject if stdout hasn't started yet and process failed
                if (!stdoutResolved && code !== 0) {
                    const errorMsg: string = resolveI18nTemplate("PQSdk.testAdapter.processExitedWithCode", {
                        code: code?.toString() || "unknown",
                        stderr: stderrData,
                    });

                    this.options?.outputChannel?.appendErrorLine(errorMsg);
                    reject(new Error(errorMsg.trim()));
                }
            });

            // Handle stdout with PassThrough stream to prevent data loss
            // This ensures the first data chunk is captured and forwarded properly
            childProcess.stdout?.on("data", (data: Buffer) => {
                if (!stdoutResolved) {
                    stdoutResolved = true;

                    // Write the first chunk of data to the PassThrough stream
                    passThroughStream.write(data);

                    // Pipe the remaining data from process.stdout to the PassThrough stream
                    childProcess.stdout!.pipe(passThroughStream);

                    // Resolve with the PassThrough stream
                    resolve(passThroughStream);
                }
            });
        });
    }
}

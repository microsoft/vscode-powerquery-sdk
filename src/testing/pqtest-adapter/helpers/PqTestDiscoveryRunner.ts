/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as path from "path";
import * as vscode from "vscode";

import { SpawnedProcess } from "../../../common/SpawnedProcess";
import { PqSdkOutputChannel } from "../../../features/PqSdkOutputChannel";
import { resolveI18nTemplate } from "../../../i18n/extension";
import { PqTestCommandBuilder } from "./PqTestCommandBuilder";

/**
 * Executes PQTest.exe discovery with --listOnly flag.
 * Uses non-streaming process execution since --listOnly outputs a single JSON blob.
 */
export class PqTestDiscoveryRunner {
    constructor(
        private readonly pqTestPath: string,
        private readonly settingsFileUri: vscode.Uri,
        private readonly extensions: string | string[] | undefined,
        private readonly outputChannel?: PqSdkOutputChannel,
    ) {}

    /**
     * Executes test discovery and returns parsed JSON result.
     *
     * @returns Parsed JSON output from pqtest.exe --listOnly
     * @throws Error if discovery fails or output cannot be parsed
     */
    async runDiscovery(): Promise<any> {
        const workingDir: string = path.dirname(this.settingsFileUri.fsPath);

        // Build command arguments using PqTestCommandBuilder
        const commandBuilder: PqTestCommandBuilder = new PqTestCommandBuilder(
            "run-compare",
            this.settingsFileUri,
            this.extensions,
        );

        const args: string[] = commandBuilder.buildArgs(["--listOnly"]);

        // Log command execution
        const commandLine: string = `${this.pqTestPath} ${args.join(" ")}`;

        const message: string = resolveI18nTemplate("PQSdk.testDiscoveryRunner.executingDiscovery", {
            command: commandLine,
        });

        this.outputChannel?.appendInfoLine(message);

        // Execute using non-streaming SpawnedProcess
        const spawnProcess: SpawnedProcess = new SpawnedProcess(this.pqTestPath, args, { cwd: workingDir });

        const processExit: any = await spawnProcess.deferred$;

        // Check exit code
        if (processExit.exitCode !== 0) {
            const errorMessage: string = resolveI18nTemplate("PQSdk.testDiscoveryRunner.discoveryFailed", {
                exitCode: processExit.exitCode?.toString() || "unknown",
            });

            this.outputChannel?.appendErrorLine(errorMessage);
            this.outputChannel?.appendErrorLine(processExit.stderr || processExit.stdout);
            throw new Error(`${errorMessage}\n${processExit.stderr || processExit.stdout}`);
        }

        // Parse JSON output
        try {
            const result: any = JSON.parse(spawnProcess.stdOut);

            return result;
        } catch (error) {
            const errorMessage: string = error instanceof Error ? error.message : String(error);

            const message: string = resolveI18nTemplate("PQSdk.testDiscoveryRunner.failedToParseDiscoveryOutput", {
                errorMessage,
            });

            this.outputChannel?.appendErrorLine(message);
            this.outputChannel?.appendErrorLine(`Raw output: ${spawnProcess.stdOut}`);
            throw new Error(message);
        }
    }
}

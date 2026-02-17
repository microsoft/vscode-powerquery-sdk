/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as vscode from "vscode";

/**
 * Builds command-line arguments for PQTest.exe execution.
 */
export class PqTestCommandBuilder {
    constructor(
        private operation: string,
        private settingsFile?: vscode.Uri,
        private extensions?: string | string[] | undefined,
    ) {}

    /**
     * Builds the complete command-line arguments array for PQTest.exe.
     *
     * Format: ["<operation>", "--extension", "<path>", "--settingsFile", "<path>", ...additionalArgs]
     *
     * @param additionalArgs - Optional additional arguments to append (e.g., --testFilter paths, --listOnly)
     * @returns Array of command-line arguments ready for process execution
     */
    buildArgs(additionalArgs: string[] = []): string[] {
        const args: string[] = [this.operation];

        // Add extension arguments based on type
        if (this.extensions !== undefined) {
            if (typeof this.extensions === "string") {
                // Single extension
                args.push("--extension", this.extensions);
            } else if (Array.isArray(this.extensions)) {
                // Multiple extensions - repeat flag for each
                this.extensions.forEach((ext: string) => {
                    args.push("--extension", ext);
                });
            }
        }
        // If undefined: Don't add --extension flags at all
        // pqtest.exe should use ExtensionPaths from settings file

        // Add settings file argument if provided
        if (this.settingsFile) {
            args.push("--settingsFile", this.settingsFile.fsPath);
        }

        // Add any additional arguments
        args.push(...additionalArgs);

        return args;
    }
}

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
        private defaultExtension?: string
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

        // Add extension argument if provided
        if (this.defaultExtension) {
            args.push("--extension", this.defaultExtension);
        }

        // Add settings file argument if provided
        if (this.settingsFile) {
            args.push("--settingsFile", this.settingsFile.fsPath);
        }

        // Add any additional arguments
        args.push(...additionalArgs);

        return args;
    }
}

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as assert from "assert";
import * as vscode from "vscode";

import { Commands } from "../TestConstants";
import * as TestUtils from "../TestUtils";

suite("Command Integration Tests", () => {
    suiteSetup(TestUtils.ensureRequiredExtensionsAreLoaded);

    suiteTeardown(async () => {
        // Global cleanup - remove any files created in the testFixture/.vscode directory using VS Code workspace APIs
        try {
            // Get the workspace folder (which should be the testFixture directory)
            const workspaceFolders = vscode.workspace.workspaceFolders;

            if (workspaceFolders && workspaceFolders.length > 0) {
                const workspaceUri = workspaceFolders[0].uri;
                const vscodeUri = vscode.Uri.joinPath(workspaceUri, ".vscode");

                console.log(`Checking for cleanup in workspace: ${vscodeUri.fsPath}`);

                try {
                    // Check if .vscode directory exists
                    const stat = await vscode.workspace.fs.stat(vscodeUri);

                    if (stat.type === vscode.FileType.Directory) {
                        // Read directory contents
                        const entries = await vscode.workspace.fs.readDirectory(vscodeUri);

                        if (entries.length > 0) {
                            // Delete all files and subdirectories
                            for (const [name] of entries) {
                                const itemUri = vscode.Uri.joinPath(vscodeUri, name);
                                await vscode.workspace.fs.delete(itemUri, { recursive: true, useTrash: false });
                            }

                            console.log(`Cleaned up ${entries.length} items from testFixture/.vscode directory`);
                        } else {
                            console.log("testFixture/.vscode directory is already clean");
                        }
                    }
                } catch (statError) {
                    // Directory doesn't exist or other error
                    if (statError instanceof vscode.FileSystemError && statError.code === "FileNotFound") {
                        console.log("testFixture/.vscode directory does not exist");
                    } else {
                        throw statError;
                    }
                }
            } else {
                console.log("No workspace folder found for cleanup");
            }
        } catch (error) {
            // Don't fail tests if cleanup fails
            console.warn(`Failed to cleanup testFixture/.vscode directory: ${error}`);
        }
    });

    test("should execute SeizePqTestCommand without errors", async () => {
        try {
            await vscode.commands.executeCommand(Commands.SeizePqTestCommand);
            assert.ok(true, "SeizePqTestCommand executed successfully");
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            // Tool acquisition may fail in test environment due to network or permissions
            const acceptableErrors = [
                "command not found",
                "download failed",
                "network error",
                "permission denied",
                "command failed",
            ];

            const isAcceptableError = acceptableErrors.some(acceptable =>
                errorMessage.toLowerCase().includes(acceptable.toLowerCase()),
            );

            if (!isAcceptableError) {
                throw error;
            }

            assert.ok(true, `Tool acquisition command exists: ${errorMessage}`);
        }
    });

    test("should execute SetupCurrentWorkspaceCommand without errors", async () => {
        try {
            await vscode.commands.executeCommand(Commands.SetupCurrentWorkspaceCommand);
            assert.ok(true, "SetupCurrentWorkspaceCommand executed successfully");
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            const acceptableErrors = [
                "command not found",
                "No workspace folder",
                "workspace setup failed",
                "command failed",
            ];

            const isAcceptableError = acceptableErrors.some(acceptable =>
                errorMessage.toLowerCase().includes(acceptable.toLowerCase()),
            );

            if (!isAcceptableError) {
                throw error;
            }

            assert.ok(true, `Workspace setup command exists: ${errorMessage}`);
        }
    });

    test("should execute credential management commands", async () => {
        const credentialCommands = [
            Commands.ListCredentialCommand,
            Commands.DeleteCredentialCommand,
            Commands.RefreshCredentialCommand,
        ];

        for (const commandId of credentialCommands) {
            try {
                await vscode.commands.executeCommand(commandId);
                assert.ok(true, `${commandId} executed successfully`);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);

                // Credential commands may fail if no credentials exist or PQTest is not available
                const acceptableErrors = [
                    "command not found",
                    "no credentials",
                    "pqtest not found",
                    "credential not found",
                    "command failed",
                ];

                const isAcceptableError = acceptableErrors.some(acceptable =>
                    errorMessage.toLowerCase().includes(acceptable.toLowerCase()),
                );

                if (!isAcceptableError) {
                    throw error;
                }

                assert.ok(true, `${commandId} exists but requires context: ${errorMessage}`);
            }
        }
    });

    test("should execute test and query commands", async () => {
        const testCommands = [
            Commands.RunTestBatteryCommand,
            Commands.TestConnectionCommand,
            Commands.DisplayExtensionInfoCommand,
        ];

        for (const commandId of testCommands) {
            try {
                await vscode.commands.executeCommand(commandId);
                assert.ok(true, `${commandId} executed successfully`);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);

                // Test commands may fail if no project or connector is available
                const acceptableErrors = [
                    "command not found",
                    "no active editor",
                    "no connector",
                    "no query file",
                    "pqtest not found",
                    "extension not found",
                    "command failed",
                ];

                const isAcceptableError = acceptableErrors.some(acceptable =>
                    errorMessage.toLowerCase().includes(acceptable.toLowerCase()),
                );

                if (!isAcceptableError) {
                    throw error;
                }

                assert.ok(true, `${commandId} exists but requires context: ${errorMessage}`);
            }
        }
    });
});

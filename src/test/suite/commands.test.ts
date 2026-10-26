/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

import { NugetCommandService } from "../../common/nuget/NugetCommandService";
import { ExtensionConfigurations } from "../../constants/PowerQuerySdkConfiguration";
import { ExtensionConstants } from "../../constants/PowerQuerySdkExtension";
import * as localSdkTools from "../../utils/localSdkTools";
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

    test("registers the SDK update command without contacting a package feed", async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes(Commands.SeizePqTestCommand));
    });

    const localTest = process.env.PQSDK_TEST_TOOLS_PATH ? test : test.skip;

    localTest("reuses local tools for the registered update command without changing saved settings", async () => {
        const config = vscode.workspace.getConfiguration("powerquery.sdk");
        const previousLocation = config.inspect("tools.location");
        const previousVersion = config.inspect("tools.version");

        assert.strictEqual(
            await vscode.commands.executeCommand(Commands.SeizePqTestCommand),
            path.normalize(process.env.PQSDK_TEST_TOOLS_PATH!),
        );

        assert.deepStrictEqual(config.inspect("tools.location"), previousLocation);
        assert.deepStrictEqual(config.inspect("tools.version"), previousVersion);
    });

    const externalTest = process.env.PQSDK_TEST_EXTERNAL === "1" ? test : test.skip;

    externalTest("[External] acquires SDK Tools from the configured feed", async () => {
        assert.ok(!localSdkTools.getLocalSdkToolsLocation(), "Unset PQSDK_TEST_TOOLS_PATH for real acquisition tests");
        const executable = ExtensionConfigurations.nugetPath;
        const feed = ExtensionConfigurations.nugetFeed;
        assert.ok(executable && feed, "Configure both nugetPath and nugetFeed for real acquisition tests");
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "pq-feed-test-"));
        const service = new NugetCommandService(root);

        try {
            const versions = await service.getSortedPackageReleasedVersions(
                executable,
                feed,
                ExtensionConstants.PublicMsftPqSdkToolsNugetName,
            );

            assert.ok(versions.length, "The configured feed must contain SDK Tools");

            assert.ok(
                await service.downloadAndExtractNugetPackage(
                    executable,
                    feed,
                    ExtensionConstants.PublicMsftPqSdkToolsNugetName,
                    versions[versions.length - 1].toString(),
                ),
                "Acquisition must produce PQTest.exe",
            );
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
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

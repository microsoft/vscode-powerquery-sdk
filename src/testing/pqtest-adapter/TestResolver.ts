/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as vscode from "vscode";
import * as path from "path";

import { ExtensionConfigurations } from "../../constants/PowerQuerySdkConfiguration";
import { extensionI18n, resolveI18nTemplate } from "../../i18n/extension";
import { PqSdkOutputChannel } from "../../features/PqSdkOutputChannel";
import { TestDiscoveryService } from "./TestDiscoveryService";
import { getTestPathFromSettings } from "./utils/testSettingsUtils";
import { getPathType, fileExists } from "../../utils/files";
import { getNormalizedPath, splitPathPreservingCase } from "./utils/pathUtils";
import { createTestItem, createCompositeId } from "./utils/testUtils";
import { resolveSubstitutedValues } from "../../utils/vscodes";

/**
 * Sorts tests to ensure proper hierarchy creation order.
 * Nested tests (in subfolders) come first, then root-level tests.
 * Within each group, tests are sorted alphabetically.
 */
function sortTestsForHierarchy(tests: any[]): any[] {
    return tests.sort((a: any, b: any) => {
        const aPath = a.RelativePath || a.Test;
        const bPath = b.RelativePath || b.Test;
        const aIsNested = aPath.includes("/") || aPath.includes("\\");
        const bIsNested = bPath.includes("/") || bPath.includes("\\");

        // If one is nested and the other isn't, nested comes first
        if (aIsNested !== bIsNested) {
            return aIsNested ? -1 : 1;
        }

        // Otherwise, sort alphabetically
        return aPath.localeCompare(bPath);
    });
}

/**
 * Resolves the children of a test item (settings file) by discovering and loading the individual test files.
 * This function is called when a user expands a settings file in the Test Explorer.
 * 
 * @param item - The test item representing a .testsettings.json file
 * @param controller - The VS Code test controller
 * @param outputChannel - Output channel for logging
 * @param token - Optional cancellation token
 */
export async function resolveTestItem(
    item: vscode.TestItem,
    controller: vscode.TestController,
    outputChannel: PqSdkOutputChannel,
    token?: vscode.CancellationToken
): Promise<void> {
    if (token?.isCancellationRequested) {
        return;
    }

    // Clear any previous error state when starting discovery
    item.error = undefined;

    // We're loading the children of a settings file TestItem
    const settingsFileUri = item.uri;
    if (!settingsFileUri) {
        item.error = extensionI18n["PQSdk.testResolver.uriNotSet"];
        return;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(settingsFileUri);
    if (!workspaceFolder) {
        item.error = resolveI18nTemplate("PQSdk.testResolver.settingsFileNotInWorkspace", {
            settingsFilePath: settingsFileUri.fsPath,
        });
        return;
    }

    // Get the test path from settings file
    let testPath: string;
    try {
        testPath = await getTestPathFromSettings(settingsFileUri.fsPath);
    } catch (err: any) {
        item.error = resolveI18nTemplate("PQSdk.testResolver.failedToReadTestDirectory", {
            settingsFilePath: settingsFileUri.fsPath,
            errorMessage: err.message,
        });
        return;
    }

    // Determine if testPath is a file or directory
    let pathType: "file" | "directory" | "not-found";
    try {
        pathType = await getPathType(testPath);
        if (pathType === "not-found") {
            item.error = resolveI18nTemplate("PQSdk.testResolver.testPathDoesNotExist", {
                testPath,
            });
            return;
        }
    } catch (err: any) {
        item.error = resolveI18nTemplate("PQSdk.testResolver.failedToCheckTestPathType", {
            errorMessage: err.message,
        });
        return;
    }

    const isFile = pathType === "file";

    // Validate default extension configuration
    const defaultExtension = resolveSubstitutedValues(
        ExtensionConfigurations.DefaultExtensionLocation
    );
    if (!defaultExtension) {
        void vscode.window.showErrorMessage(extensionI18n["PQSdk.testResolver.defaultExtensionNotConfigured"]);
        return;
    }

    // Validate that the default extension file exists
    if (!(await fileExists(defaultExtension))) {
        void vscode.window.showErrorMessage(extensionI18n["PQSdk.testResolver.defaultExtensionFileNotFound"]);
        return;
    }

    try {
        if (isFile) {
            // Handle single test file case
            const normalizedTestPath = getNormalizedPath(testPath);
            const testFileUri = vscode.Uri.file(normalizedTestPath);
            const testFileName = path.basename(testPath); // Keep file name for the label
            const normalizedTestFileName = path.basename(normalizedTestPath); // Use normalized for the ID

            // Create composite ID for test files: testId|settingsFilePath
            const testId = "test:" + normalizedTestFileName;
            const compositeId = createCompositeId(testId, settingsFileUri);

            createTestItem(
                controller,
                compositeId,
                testFileName, // Original case for label
                testFileUri,
                false, // canResolveChildren
                undefined, // sortText
                item // parentItem
            );

            outputChannel.appendLine(
                resolveI18nTemplate("PQSdk.testResolver.addedSingleTestFile", {
                    testFileName,
                })
            );
        } else {
            // Handle test directory case - use TestDiscoveryService
            const discoveryService = new TestDiscoveryService(outputChannel);
            const pqTestResult = await discoveryService.discoverTests(settingsFileUri, token);

            // Log the full result for debugging
            outputChannel.appendLine(
                resolveI18nTemplate("PQSdk.testResolver.pqtestResultStructure", {
                    resultJson: JSON.stringify(pqTestResult, null, 2),
                })
            );

            // Extract the Tests array from the result
            const tests = pqTestResult.Tests || [];
            outputChannel.appendLine(
                resolveI18nTemplate("PQSdk.testResolver.foundTestFiles", {
                    testCount: tests.length.toString(),
                })
            );

            if (tests.length === 0) {
                item.error = extensionI18n["PQSdk.testResolver.noTestsFound"];
            }

            // Map to track created folder items to prevent duplicates
            const folderMap = new Map<string, vscode.TestItem>();

            // Sort tests: folders first, then files, alphabetically within each group
            const sortedTests = sortTestsForHierarchy(tests);

            // Create TestItems for each discovered test
            for (const test of sortedTests) {
                if (token?.isCancellationRequested) {
                    return;
                }
                try {
                    // Get the relative path and split it preserving original case for labels
                    const relativePath = test.RelativePath || test.Test;
                    const { normalizedParts, originalParts } = splitPathPreservingCase(
                        relativePath,
                        outputChannel
                    );
                    const normalizedPath = getNormalizedPath(relativePath);

                    let parentItem = item; // Start with the settings file item

                    // If there are folders in the path (more than just the filename)
                    if (normalizedParts.length > 1) {
                        // Build folder hierarchy (all parts except the last one)
                        for (let i = 0; i < normalizedParts.length - 1; i++) {
                            // Build the full folder path up to this level (using normalized parts for ID)
                            const folderPathParts = normalizedParts.slice(0, i + 1);
                            const folderPath = folderPathParts.join("/");

                            if (!folderMap.has(folderPath)) {
                                try {
                                    // Create folder test item - use original case for label
                                    const folderName = originalParts[i]; // Preserve original case for display
                                    const folderId = "folder:" + folderPath;

                                    // Create composite ID for folders: folderId|settingsFilePath
                                    const compositeFolderId = createCompositeId(
                                        folderId,
                                        settingsFileUri
                                    );

                                    // Calculate the absolute path for the folder
                                    const folderAbsolutePath = path.join(testPath, folderPath);
                                    const normalizedFolderAbsolutePath = getNormalizedPath(
                                        folderAbsolutePath
                                    );
                                    const folderUri = vscode.Uri.file(normalizedFolderAbsolutePath);

                                    const folderItem = createTestItem(
                                        controller,
                                        compositeFolderId,
                                        folderName,
                                        folderUri,
                                        false, // canResolveChildren
                                        `a_${folderName}`, // sortText
                                        parentItem // parentItem
                                    );

                                    // Store in map for hierarchy building
                                    folderMap.set(folderPath, folderItem);

                                    outputChannel.appendLine(
                                        resolveI18nTemplate("PQSdk.testResolver.creatingFolderItem", {
                                            folderName,
                                            folderId: folderItem.id,
                                            folderPath,
                                        })
                                    );
                                } catch (folderError) {
                                    outputChannel.appendLine(
                                        resolveI18nTemplate("PQSdk.testResolver.failedToCreateFolderItem", {
                                            folderPath,
                                            errorMessage:
                                                folderError instanceof Error
                                                    ? folderError.message
                                                    : String(folderError),
                                        })
                                    );
                                    // Continue with parent item if folder creation fails
                                }
                            } else {
                                outputChannel.appendLine(
                                    resolveI18nTemplate("PQSdk.testResolver.reusedExistingFolder", {
                                        folderPath,
                                    })
                                );
                            }

                            // Update parent for next iteration or file creation
                            parentItem = folderMap.get(folderPath) || parentItem;
                        }
                    }

                    // Create the test file item under its parent (folder or root)
                    const testId = "test:" + normalizedPath;
                    const label = test.Test; // Just the filename
                    const uri = test.AbsolutePath
                        ? vscode.Uri.file(getNormalizedPath(test.AbsolutePath))
                        : undefined;

                    // Create composite ID for test files: originalTestId|settingsFilePath
                    const compositeTestId = uri ? createCompositeId(testId, settingsFileUri) : testId;

                    outputChannel.appendLine(
                        resolveI18nTemplate("PQSdk.testResolver.creatingTestItem", {
                            compositeTestId,
                            label,
                            uriPath: uri?.fsPath || "none",
                        })
                    );

                    createTestItem(
                        controller,
                        compositeTestId,
                        label,
                        uri,
                        undefined, // canResolveChildren (default)
                        `b_${label}`, // sortText to ensure folders appear before files
                        parentItem // parentItem
                    );
                } catch (error) {
                    outputChannel.appendLine(
                        resolveI18nTemplate("PQSdk.testResolver.failedToCreateTestItem", {
                            testName: test.Test,
                            errorMessage: error instanceof Error ? error.message : String(error),
                        })
                    );
                }
            }

            outputChannel.appendLine(
                resolveI18nTemplate("PQSdk.testResolver.successfullyCreatedTestItems", {
                    testCount: tests.length.toString(),
                })
            );
        }
    } catch (err: any) {
        item.error = resolveI18nTemplate("PQSdk.testResolver.failedToDiscoverTests", {
            errorMessage: err.message,
        });
        outputChannel.appendLine(
            resolveI18nTemplate("PQSdk.testResolver.testDiscoveryFailed", {
                errorMessage: err.message,
            })
        );
    } finally {
        // No more children to resolve - mark this item as fully resolved
        item.canResolveChildren = false;
    }
}

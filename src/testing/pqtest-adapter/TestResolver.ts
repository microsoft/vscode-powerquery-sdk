/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as path from "path";
import * as vscode from "vscode";

import { PqSdkOutputChannel } from "../../features/PqSdkOutputChannel";
import { extensionI18n, resolveI18nTemplate } from "../../i18n/extension";
import { TestDiscoveryService } from "./TestDiscoveryService";
import { getNormalizedPath, splitPathPreservingCase } from "./utils/pathUtils";
import { getTestPathFromSettings } from "./utils/testSettingsUtils";
import { createCompositeId, createTestItem } from "./utils/testUtils";
import { getPathType } from "./utils/vscodeFs";

/**
 * Sorts tests to ensure proper hierarchy creation order.
 * Nested tests (in subfolders) come first, then root-level tests.
 * Within each group, tests are sorted alphabetically.
 */
function sortTestsForHierarchy(tests: unknown[]): unknown[] {
    return tests.sort((a: unknown, b: unknown) => {
        const aPath: string =
            (a as { RelativePath?: string; Test?: string }).RelativePath ||
            (a as { RelativePath?: string; Test?: string }).Test ||
            "";

        const bPath: string =
            (b as { RelativePath?: string; Test?: string }).RelativePath ||
            (b as { RelativePath?: string; Test?: string }).Test ||
            "";

        const aIsNested: boolean = aPath.includes("/") || aPath.includes("\\");
        const bIsNested: boolean = bPath.includes("/") || bPath.includes("\\");

        // If one is nested and the other isn't, nested comes first
        if (aIsNested !== bIsNested) {
            return aIsNested ? -1 : 1;
        }

        // Otherwise, sort alphabetically
        return aPath.localeCompare(bPath);
    });
}

/**
 * Resolves a test item (settings file) by discovering and creating children test items.
 * This function is called when a user expands a settings file in the Test Explorer or programmatically.
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
    token?: vscode.CancellationToken,
): Promise<void> {
    if (token?.isCancellationRequested) {
        return;
    }

    // Clear any previous error state when starting discovery
    item.error = undefined;

    // We're loading the children of a settings file TestItem
    const settingsFileUri: vscode.Uri | undefined = item.uri;

    if (!settingsFileUri) {
        item.error = extensionI18n["PQSdk.testResolver.uriNotSet"];

        return;
    }

    const workspaceFolder: vscode.WorkspaceFolder | undefined = vscode.workspace.getWorkspaceFolder(settingsFileUri);

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
    } catch (err: unknown) {
        // eslint-disable-next-line require-atomic-updates -- Error assignment is intentional
        item.error = resolveI18nTemplate("PQSdk.testResolver.failedToReadTestDirectory", {
            settingsFilePath: settingsFileUri.fsPath,
            errorMessage: err instanceof Error ? err.message : String(err),
        });

        return;
    }

    // Determine if testPath is a file or directory
    let pathType: "file" | "directory" | "not-found";

    try {
        pathType = await getPathType(testPath);

        if (pathType === "not-found") {
            // eslint-disable-next-line require-atomic-updates -- Error assignment is intentional
            item.error = resolveI18nTemplate("PQSdk.testResolver.testPathDoesNotExist", {
                testPath,
            });

            return;
        }
    } catch (err: unknown) {
        // eslint-disable-next-line require-atomic-updates -- Error assignment is intentional
        item.error = resolveI18nTemplate("PQSdk.testResolver.failedToCheckTestPathType", {
            errorMessage: err instanceof Error ? err.message : String(err),
        });

        return;
    }

    const isFile: boolean = pathType === "file";

    try {
        if (isFile) {
            // Handle single test file case
            const normalizedTestPath: string = getNormalizedPath(testPath);
            const testFileUri: vscode.Uri = vscode.Uri.file(normalizedTestPath);
            const testFileName: string = path.basename(testPath); // Keep pre-normalised file name for the label
            const normalizedTestFileName: string = path.basename(normalizedTestPath); // Use normalized for the ID

            // Create composite ID for test files: testId|settingsFilePath
            const testId: string = `test:${normalizedTestFileName}`;
            const compositeId: string = createCompositeId(testId, settingsFileUri);

            createTestItem(
                controller,
                compositeId,
                testFileName, // Original case for label
                testFileUri,
                false, // canResolveChildren
                undefined, // sortText
                item, // parentItem
            );

            outputChannel.appendInfoLine(
                resolveI18nTemplate("PQSdk.testResolver.addedSingleTestFile", {
                    testFileName,
                }),
            );
        } else {
            // Handle test directory case - use TestDiscoveryService
            const discoveryService: TestDiscoveryService = new TestDiscoveryService(outputChannel);
            const pqTestResult: unknown = await discoveryService.discoverTests(settingsFileUri, token);

            // Log the full result for debugging
            outputChannel.appendDebugLine(
                resolveI18nTemplate("PQSdk.testResolver.pqtestResultStructure", {
                    resultJson: JSON.stringify(pqTestResult, null, 2),
                }),
            );

            // Extract the Tests array from the result
            const tests: unknown[] = (pqTestResult as { Tests?: unknown[] }).Tests || [];

            outputChannel.appendDebugLine(
                resolveI18nTemplate("PQSdk.testResolver.foundTestFiles", {
                    testCount: tests.length.toString(),
                }),
            );

            if (tests.length === 0) {
                // eslint-disable-next-line require-atomic-updates -- Error assignment is intentional
                item.error = extensionI18n["PQSdk.testResolver.noTestsFound"];
            }

            // Map to track created folder items to prevent duplicates
            const folderMap: Map<string, vscode.TestItem> = new Map<string, vscode.TestItem>();

            // Sort tests: folders first, then files, alphabetically within each group
            const sortedTests: unknown[] = sortTestsForHierarchy(tests);

            // Create TestItems for each discovered test
            for (const test of sortedTests) {
                if (token?.isCancellationRequested) {
                    return;
                }

                try {
                    // Get the relative path and split it preserving original case for labels
                    const relativePath: string =
                        (test as { RelativePath?: string; Test?: string }).RelativePath ||
                        (test as { RelativePath?: string; Test?: string }).Test ||
                        "";

                    const {
                        normalizedParts,
                        originalParts,
                    }: {
                        normalizedParts: string[];
                        originalParts: string[];
                    } = splitPathPreservingCase(relativePath, outputChannel);

                    const normalizedPath: string = getNormalizedPath(relativePath);

                    let parentItem: vscode.TestItem = item; // Start with the settings file item

                    // If there are folders in the path (more than just the filename)
                    if (normalizedParts.length > 1) {
                        // Build folder hierarchy (all parts except the last one)
                        for (let i: number = 0; i < normalizedParts.length - 1; i++) {
                            // Build the full folder path up to this level (using normalized parts for ID)
                            const folderPathParts: string[] = normalizedParts.slice(0, i + 1);
                            const folderPath: string = folderPathParts.join("/");

                            if (!folderMap.has(folderPath)) {
                                try {
                                    // Create folder test item - use original case for label
                                    const folderName: string = originalParts[i]; // Preserve original case for display
                                    const folderId: string = `folder:${folderPath}`;

                                    // Create composite ID for folders: folderId|settingsFilePath
                                    const compositeFolderId: string = createCompositeId(folderId, settingsFileUri);

                                    // Calculate the absolute path for the folder
                                    const folderAbsolutePath: string = path.join(testPath, folderPath);

                                    const normalizedFolderAbsolutePath: string = getNormalizedPath(folderAbsolutePath);

                                    const folderUri: vscode.Uri = vscode.Uri.file(normalizedFolderAbsolutePath);

                                    const folderItem: vscode.TestItem = createTestItem(
                                        controller,
                                        compositeFolderId,
                                        folderName,
                                        folderUri,
                                        false, // canResolveChildren
                                        `a_${folderName}`, // sortText
                                        parentItem, // parentItem
                                    );

                                    // Store in map for hierarchy building
                                    folderMap.set(folderPath, folderItem);

                                    outputChannel.appendDebugLine(
                                        resolveI18nTemplate("PQSdk.testResolver.creatingFolderItem", {
                                            folderName,
                                            folderId: folderItem.id,
                                            folderPath,
                                        }),
                                    );
                                } catch (folderError) {
                                    outputChannel.appendErrorLine(
                                        resolveI18nTemplate("PQSdk.testResolver.failedToCreateFolderItem", {
                                            folderPath,
                                            errorMessage:
                                                folderError instanceof Error
                                                    ? folderError.message
                                                    : String(folderError),
                                        }),
                                    );
                                    // Continue with parent item if folder creation fails
                                }
                            } else {
                                outputChannel.appendDebugLine(
                                    resolveI18nTemplate("PQSdk.testResolver.reusedExistingFolder", {
                                        folderPath,
                                    }),
                                );
                            }

                            // Update parent for next iteration or file creation
                            parentItem = folderMap.get(folderPath) || parentItem;
                        }
                    }

                    // Create the test file item under its parent (folder or root)
                    const testId: string = `test:${normalizedPath}`;
                    const label: string = (test as { Test: string }).Test; // Just the filename

                    const uri: vscode.Uri | undefined = (test as { AbsolutePath?: string }).AbsolutePath
                        ? vscode.Uri.file(getNormalizedPath((test as { AbsolutePath: string }).AbsolutePath))
                        : undefined;

                    // Create composite ID for test files: originalTestId|settingsFilePath
                    const compositeTestId: string = uri ? createCompositeId(testId, settingsFileUri) : testId;

                    outputChannel.appendDebugLine(
                        resolveI18nTemplate("PQSdk.testResolver.creatingTestItem", {
                            compositeTestId,
                            label,
                            uriPath: uri?.fsPath || "none",
                        }),
                    );

                    createTestItem(
                        controller,
                        compositeTestId,
                        label,
                        uri,
                        undefined, // canResolveChildren (default)
                        `b_${label}`, // sortText to ensure folders appear before files
                        parentItem, // parentItem
                    );
                } catch (error) {
                    outputChannel.appendErrorLine(
                        resolveI18nTemplate("PQSdk.testResolver.failedToCreateTestItem", {
                            testName: (test as { Test: string }).Test,
                            errorMessage: error instanceof Error ? error.message : String(error),
                        }),
                    );
                }
            }

            outputChannel.appendInfoLine(
                resolveI18nTemplate("PQSdk.testResolver.successfullyCreatedTestItems", {
                    testCount: tests.length.toString(),
                }),
            );
        }
    } catch (err: unknown) {
        // eslint-disable-next-line require-atomic-updates -- Error assignment is intentional
        item.error = resolveI18nTemplate("PQSdk.testResolver.failedToDiscoverTests", {
            errorMessage: err instanceof Error ? err.message : String(err),
        });

        outputChannel.appendErrorLine(
            resolveI18nTemplate("PQSdk.testResolver.testDiscoveryFailed", {
                errorMessage: err instanceof Error ? err.message : String(err),
            }),
        );
    } finally {
        // No more children to resolve - mark this item as fully resolved
        // eslint-disable-next-line require-atomic-updates -- Intentional flag update after async operations complete
        item.canResolveChildren = false;
    }
}

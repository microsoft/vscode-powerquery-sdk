/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

/**
 * Coordinates test runs by interpreting VS Code test run requests and orchestrating execution.
 */

import * as vscode from "vscode";

import { PqSdkOutputChannel } from "../../features/PqSdkOutputChannel";
import { ExtensionConstants } from "../../constants/PowerQuerySdkExtension";
import { extensionI18n, resolveI18nTemplate } from "../../i18n/extension";
import { getLeafNodes, parseCompositeId } from "./utils/testUtils";
import { getNormalizedUriString, getRelativeTestPath } from "./utils/pathUtils";
import { TestRunExecutor } from "./TestRunExecutor";
import { refreshAllTests, refreshSettingsItem } from "./TestController";

// Delay to allow test state and UI to stabilize after test discovery
// This value is experimental and determined through testing with various connectors.
// TODO: Monitor and adjust this timing based on user feedback and additional connector testing.
const DELAY_AFTER_DISCOVERY_MS = 100;

// Threshold for batch discovery optimization
// When more than 80% of items are unexpanded, batch refresh is more efficient than individual discovery
// This value is experimental and determined through performance testing
// TODO: Monitor and adjust based on user feedback and performance metrics
const BATCH_DISCOVERY_THRESHOLD = 0.8;

/**
 * Represents a group of tests that share the same settings file.
 */
interface TestGroup {
    settingsItem: vscode.TestItem;
    childItems: vscode.TestItem[];
}

export class TestRunCoordinator {
    constructor(
        private readonly request: vscode.TestRunRequest,
        private readonly testRun: vscode.TestRun,
        private readonly pqTestPath: string,
        private readonly defaultExtension: string,
        private readonly testController: vscode.TestController,
        private readonly outputChannel: PqSdkOutputChannel,
        private readonly cancellationToken: vscode.CancellationToken
    ) {}

    /**
     * Executes the test run based on the request type (all tests vs. selected tests).
     */
    async run(): Promise<void> {
        this.outputChannel.appendLine(extensionI18n["PQSdk.testAdapter.coordinator.startingExecution"]);

        try {
            if (!this.request.include || this.request.include.length === 0) {
                // Case 1: Run All Tests
                await this.runAllTests();
            } else {
                // Case 2 & 3: Run specific tests or groups
                await this.runSelectedTests();
            }
        } finally {
            this.outputChannel.appendLine(extensionI18n["PQSdk.testAdapter.coordinator.executionCompleted"]);
        }
    }

    /**
     * Runs all tests by iterating through all top-level test items corresponding to test settings files.
     */
    private async runAllTests(): Promise<void> {
        this.outputChannel.appendLine(extensionI18n["PQSdk.testAdapter.coordinator.runningAllTests"]);

        // Count unexpanded items to determine if we should use batch optimization
        let unexpandedCount = 0;
        let totalCount = 0;
        this.testController.items.forEach((settingsItem) => {
            totalCount++;
            if (settingsItem.children.size === 0) {
                unexpandedCount++;
            }
        });

        const unexpandedRatio = totalCount > 0 ? unexpandedCount / totalCount : 0;

        // If most items are unexpanded, use optimized batch refresh
        if (unexpandedRatio > BATCH_DISCOVERY_THRESHOLD) {
            this.outputChannel.appendLine(
                resolveI18nTemplate("PQSdk.testAdapter.coordinator.usingBatchOptimization", {
                    unexpandedCount: unexpandedCount.toString(),
                    totalCount: totalCount.toString(),
                })
            );
            await refreshAllTests(this.testController, this.outputChannel);

            // Small delay to allow UI and test state to stabilize after batch discovery
            await new Promise((resolve) => setTimeout(resolve, DELAY_AFTER_DISCOVERY_MS));

            // Now run all tests (already discovered)
            const promises: Promise<void>[] = [];
            this.testController.items.forEach((settingsItem) => {
                if (this.cancellationToken.isCancellationRequested) return;
                promises.push(this.runTestSet(settingsItem));
            });
            await Promise.all(promises);
        } else {
            // Use individual discovery for unexpanded items
            const promises: Promise<void>[] = [];
            this.testController.items.forEach((settingsItem) => {
                if (this.cancellationToken.isCancellationRequested) return;
                promises.push(this.runTestSetWithAutoDiscovery(settingsItem));
            });
            await Promise.all(promises);
        }
    }

    /**
     * Runs tests for a settings item, auto-discovering tests if not yet expanded.
     */
    private async runTestSetWithAutoDiscovery(settingsItem: vscode.TestItem): Promise<void> {
        // Check if the settings item has been expanded (children discovered)
        if (settingsItem.children.size === 0) {
            // Auto-discover tests for unexpanded settings item
            this.outputChannel.appendLine(
                resolveI18nTemplate("PQSdk.testAdapter.coordinator.autoDiscoveringTests", {
                    label: settingsItem.label,
                })
            );
            await refreshSettingsItem(settingsItem, this.testController, this.outputChannel);

            // Small delay to allow UI and test state to stabilize after discovery
            await new Promise((resolve) => setTimeout(resolve, DELAY_AFTER_DISCOVERY_MS));
        }

        // Now run the tests
        await this.runTestSet(settingsItem);
    }

    /**
     * Runs selected tests based on the request.
     */
    private async runSelectedTests(): Promise<void> {
        this.outputChannel.appendLine(extensionI18n["PQSdk.testAdapter.coordinator.runningSelectedTests"]);

        if (!this.request.include) return;

        // Step 1: Filter out redundant child items when parent settings file is also selected
        const filteredItems = this.filterRedundantTestItems(this.request.include);
        this.outputChannel.appendLine(
            resolveI18nTemplate("PQSdk.testAdapter.coordinator.filteredTestItems", {
                originalCount: this.request.include.length.toString(),
                filteredCount: filteredItems.length.toString(),
            })
        );

        // Step 2: Group remaining items by their settings file
        const testGroups = this.groupTestsBySettingsFile(filteredItems);
        this.outputChannel.appendLine(
            resolveI18nTemplate("PQSdk.testAdapter.coordinator.groupedTestItems", {
                groupCount: testGroups.length.toString(),
            })
        );

        // Step 3: Execute each group with appropriate test filters
        const promises: Promise<void>[] = [];

        for (const group of testGroups) {
            if (this.cancellationToken.isCancellationRequested) break;

            if (group.childItems.length === 0) {
                // Only the settings item is selected - check if it needs discovery
                if (group.settingsItem.children.size === 0) {
                    // Auto-discover tests for unexpanded settings item
                    this.outputChannel.appendLine(
                        resolveI18nTemplate("PQSdk.testAdapter.coordinator.autoDiscoveringTests", {
                            label: group.settingsItem.label,
                        })
                    );
                    await refreshSettingsItem(group.settingsItem, this.testController, this.outputChannel);
                }
                // Run all tests (no filters)
                promises.push(this.runTestSet(group.settingsItem));
            } else {
                // Specific child items are selected - run with test filters
                promises.push(this.runTestGroupWithFilters(group));
            }
        }

        await Promise.all(promises);
    }

    /**
     * Runs all tests for a specific settings file.
     */
    private async runTestSet(settingsItem: vscode.TestItem): Promise<void> {
        if (!settingsItem.uri) return;

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(settingsItem.uri);
        if (!workspaceFolder) {
            vscode.window.showErrorMessage(
                extensionI18n["PQSdk.testAdapter.coordinator.settingsFileNotInWorkspaceFolder"]
            );
            return;
        }

        // Create the TestRunExecutor
        const executor = new TestRunExecutor(
            this.pqTestPath,
            this.defaultExtension,
            settingsItem.uri,
            this.testRun,
            this.outputChannel,
            this.cancellationToken
        );

        // Get all leaf test items under this settings file and add them to the executor
        const leafItems = getLeafNodes(settingsItem);
        leafItems.forEach((leafItem) => {
            executor.addTestItem(leafItem);
        });

        // Run all tests for this settings file (no additional args)
        await executor.execute();
    }

    /**
     * Runs a test group with specific test filters.
     *
     * @param group - The test group containing settings item and child items to run
     */
    private async runTestGroupWithFilters(group: TestGroup): Promise<void> {
        const settingsItem = group.settingsItem;

        if (!settingsItem.uri) return;

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(settingsItem.uri);
        if (!workspaceFolder) {
            vscode.window.showErrorMessage(
                extensionI18n["PQSdk.testAdapter.coordinator.settingsFileNotInWorkspaceFolder"]
            );
            return;
        }

        // Generate test filter arguments
        const testFilterArgs = await this.generateTestFilters(group.childItems, settingsItem);

        if (testFilterArgs.length === 0) {
            this.outputChannel.appendLine(
                resolveI18nTemplate("PQSdk.testAdapter.coordinator.noValidTestFiltersGenerated", {
                    settingsFilePath: settingsItem.uri.fsPath,
                })
            );
            return;
        }

        // Create the TestRunExecutor
        const executor = new TestRunExecutor(
            this.pqTestPath,
            this.defaultExtension,
            settingsItem.uri,
            this.testRun,
            this.outputChannel,
            this.cancellationToken
        );

        // Add only the leaf test items from the child items to the executor
        group.childItems.forEach((childItem) => {
            const leafItems = getLeafNodes(childItem);
            leafItems.forEach((leafItem) => {
                executor.addTestItem(leafItem);
            });
        });

        // Run with test filter arguments
        await executor.execute(testFilterArgs);
    }

    /**
     * Filters out child test items when their parent (settings file) is also selected.
     * This prevents duplicate test execution when both a settings file and its children are selected.
     *
     * @param selectedItems - The originally selected test items
     * @returns Filtered array of test items with redundant children removed
     */
    private filterRedundantTestItems(selectedItems: readonly vscode.TestItem[]): vscode.TestItem[] {
        const settingsFiles = new Set<string>();
        const childItems = new Map<string, vscode.TestItem[]>();

        // First pass: identify all selected settings files and categorize child items
        for (const item of selectedItems) {
            const compositeInfo = parseCompositeId(item.id);

            if (!compositeInfo) {
                // This is a settings file (top-level)
                if (item.uri && item.uri.fsPath.endsWith(ExtensionConstants.TestAdapter.TestSettingsFileEnding)) {
                    settingsFiles.add(getNormalizedUriString(item.uri));
                }
            } else {
                // This is a child item (file/folder under settings)
                const settingsUri = compositeInfo.settingsFileUri; // Already normalized from parseCompositeId
                if (!childItems.has(settingsUri)) {
                    childItems.set(settingsUri, []);
                }
                childItems.get(settingsUri)!.push(item);
            }
        }

        // Second pass: filter out child items whose parent settings file is selected
        const filteredItems: vscode.TestItem[] = [];

        for (const item of selectedItems) {
            const compositeInfo = parseCompositeId(item.id);

            if (!compositeInfo) {
                // Always include settings files
                filteredItems.push(item);
            } else {
                // Only include child items if their parent settings file is NOT selected
                const settingsUri = compositeInfo.settingsFileUri;
                if (!settingsFiles.has(settingsUri)) {
                    filteredItems.push(item);
                }
            }
        }

        return filteredItems;
    }

    /**
     * Groups test items by their settings file.
     *
     * @param filteredItems - Test items that have been filtered for redundancy
     * @returns Array of test groups, each containing a settings item and its associated child items
     */
    private groupTestsBySettingsFile(filteredItems: vscode.TestItem[]): TestGroup[] {
        const groups = new Map<string, TestGroup>();

        for (const item of filteredItems) {
            const compositeInfo = parseCompositeId(item.id);

            if (!compositeInfo) {
                // This is a settings file - validate it's a .testsettings.json file
                if (item.uri && item.uri.fsPath.endsWith(ExtensionConstants.TestAdapter.TestSettingsFileEnding)) {
                    const settingsUri = getNormalizedUriString(item.uri);
                    if (!groups.has(settingsUri)) {
                        groups.set(settingsUri, {
                            settingsItem: item,
                            childItems: [],
                        });
                    }
                } else {
                    // Show error for invalid items
                    const itemPath = item.uri?.fsPath || "unknown";
                    vscode.window.showErrorMessage(
                        resolveI18nTemplate("PQSdk.testAdapter.coordinator.invalidTestItemSelected", {
                            itemPath,
                        })
                    );
                    this.outputChannel.appendLine(
                        resolveI18nTemplate("PQSdk.testAdapter.coordinator.skippingInvalidTestItem", {
                            itemId: item.id,
                            itemPath,
                        })
                    );
                }
            } else {
                // This is a child item - find or create its settings group
                const settingsUri = compositeInfo.settingsFileUri; // Already normalized

                if (!groups.has(settingsUri)) {
                    // Find the settings item
                    let settingsItem: vscode.TestItem | undefined;
                    this.testController.items.forEach((topLevelItem) => {
                        if (topLevelItem.uri && getNormalizedUriString(topLevelItem.uri) === settingsUri) {
                            settingsItem = topLevelItem;
                        }
                    });

                    if (settingsItem) {
                        groups.set(settingsUri, {
                            settingsItem,
                            childItems: [item],
                        });
                    }
                } else {
                    groups.get(settingsUri)!.childItems.push(item);
                }
            }
        }

        return Array.from(groups.values());
    }

    /**
     * Generates test filter arguments for a group of child test items.
     *
     * @param childItems - Array of child test items to generate filters for
     * @param settingsItem - The settings file item that defines the base QueryFilePath
     * @returns Array of command-line arguments for test filtering (--testFilter path1 --testFilter path2 ...)
     */
    private async generateTestFilters(childItems: vscode.TestItem[], settingsItem: vscode.TestItem): Promise<string[]> {
        const filterArgs: string[] = [];

        for (const childItem of childItems) {
            if (!childItem.uri) {
                this.outputChannel.appendLine(
                    resolveI18nTemplate("PQSdk.testAdapter.coordinator.skippingTestItemWithoutUri", {
                        itemId: childItem.id,
                    })
                );
                continue;
            }

            try {
                const stats = await vscode.workspace.fs.stat(childItem.uri);
                const isDirectory = stats.type === vscode.FileType.Directory;

                let relativePath = await getRelativeTestPath(childItem.uri, settingsItem.uri!);

                if (isDirectory) {
                    relativePath = `${relativePath.replace(/\\/g, "/")}/**/*.query.pq`;
                }

                filterArgs.push("--testFilter", relativePath);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.outputChannel.appendLine(
                    resolveI18nTemplate("PQSdk.testAdapter.coordinator.errorCalculatingRelativePath", {
                        itemId: childItem.id,
                        errorMessage,
                    })
                );
                this.outputChannel.appendLine(
                    resolveI18nTemplate("PQSdk.testAdapter.coordinator.skippingTestItemWithPath", {
                        filePath: childItem.uri.fsPath,
                    })
                );
                // Continue with other test items
            }
        }

        return filterArgs;
    }
}

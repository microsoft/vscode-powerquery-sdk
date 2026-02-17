/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

/**
 * Test controller management for the PQTest VSCode UI integration.
 * Handles VS Code Test Explorer integration, test runs, and custom commands' registration and logic.
 */

import * as vscode from "vscode";

import { ExtensionConstants } from "../../constants/PowerQuerySdkExtension";
import { extensionI18n, resolveI18nTemplate } from "../../i18n/extension";
import { PqSdkOutputChannel } from "../../features/PqSdkOutputChannel";
import { fileExists } from "./utils/vscodeFs";
import { getOutputFilePathForTestItem } from "./utils/pathUtils";
import { resolveTestItem } from "./TestResolver";
import { TestWatcherManager } from "./TestWatcherManager";
import { createTestItem } from "./utils/testUtils";
import { TestRunCoordinator } from "./TestRunCoordinator";
import { resolvePqTestExecutablePath } from "../../utils/pqTestPath";
import {
    cleanupOldIntermediateResults,
    initializeCleanupTimer,
    maybeCleanupIntermediateResults,
} from "./utils/cleanupUtils";

// UI delay constants for test expansion operations
const DELAY_FOR_UI_REVEAL_MS = 250;
const DELAY_BEFORE_SINGLE_CHILD_REVEAL_MS = 400;

/**
 * Guard flag to prevent concurrent refresh operations.
 * Set to true when refresh starts, cleared in finally block.
 */
let isRefreshInProgress = false;

// https://code.visualstudio.com/api/extension-guides/testing#additional-contribution-points
export function registerCommands(
    context: vscode.ExtensionContext,
    controller: vscode.TestController,
    outputChannel: PqSdkOutputChannel,
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(ExtensionConstants.TestAdapter.OpenOutputFileCommand, showExpectedOutputFile),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(ExtensionConstants.TestAdapter.RefreshAllTestsCommand, () =>
            refreshAllTests(controller, outputChannel),
        ),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(ExtensionConstants.TestAdapter.RefreshSettingsItemTestsCommand, testItem =>
            refreshSettingsItemWithProgress(testItem, controller, outputChannel),
        ),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(ExtensionConstants.TestAdapter.ClearAllTestsCommand, () =>
            clearAllTests(controller, outputChannel),
        ),
    );
}

/**
 * Creates and registers the test controller for VS Code Test Explorer
 */
export function registerTestController(
    context: vscode.ExtensionContext,
    outputChannel: PqSdkOutputChannel,
): vscode.TestController {
    const controller: vscode.TestController = vscode.tests.createTestController(
        ExtensionConstants.TestAdapter.TestControllerId,
        ExtensionConstants.TestAdapter.TestControllerName,
    );

    context.subscriptions.push(controller);

    controller.createRunProfile(
        ExtensionConstants.TestAdapter.TestRunProfileName,
        vscode.TestRunProfileKind.Run,
        (request, token) => runHandler(request, token, controller, outputChannel),
    );

    // Create and initialize the watcher manager
    const watcherManager = new TestWatcherManager(controller, outputChannel);
    watcherManager.initialize();
    context.subscriptions.push(watcherManager);

    // Initialize cleanup timer and run initial cleanup
    initializeCleanupTimer(outputChannel);
    void cleanupOldIntermediateResults(outputChannel);

    // Only handle child test item resolution
    // Initial discovery is handled by TestWatcherManager
    controller.resolveHandler = async item => {
        if (item) {
            // Skip if no workspace folders are open
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                return;
            }

            // User expanded a test settings file, so discover its children
            await refreshSettingsItemWithProgress(item, controller, outputChannel);
        }
        // When item is null, do nothing - TestWatcherManager handles initial discovery
    };

    return controller;
}

/**
 * Handles test run requests from VS Code Test Explorer
 */
async function runHandler(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken,
    controller: vscode.TestController,
    outputChannel: PqSdkOutputChannel,
): Promise<void> {
    // Trigger throttled cleanup of old intermediate results (fire-and-forget)
    maybeCleanupIntermediateResults();

    const runName: string = getTestRunFolderName();
    const testRun: vscode.TestRun = controller.createTestRun(request, runName);

    try {
        // Get PQTest.exe path
        let pqTestPath: string;

        try {
            pqTestPath = resolvePqTestExecutablePath();
        } catch (error) {
            const errorMessage: string = error instanceof Error ? error.message : String(error);
            outputChannel.appendErrorLine(`Failed to resolve PQTest.exe path: ${errorMessage}`);
            vscode.window.showErrorMessage(`Failed to resolve PQTest.exe path: ${errorMessage}`);

            return;
        }

        // Create and run coordinator
        const coordinator = new TestRunCoordinator(request, testRun, pqTestPath, controller, outputChannel, token);

        await coordinator.run();
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        outputChannel.appendErrorLine(`Error in runHandler: ${errorMessage}`);
        vscode.window.showErrorMessage(`Error running tests: ${errorMessage}`);
    } finally {
        testRun.end();
    }
}

/**
 * Generates a timestamp-based folder name for test runs
 */
function getTestRunFolderName(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0"); // Months are 0-based
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");

    return `${year}-${month}-${day}T${hours}-${minutes}-${seconds}`;
}

/**
 * Clears all children from top-level test settings items,
 * collapsing them in the Test Explorer UI.
 * Items can be re-expanded to trigger rediscovery.
 */
function clearAllTests(controller: vscode.TestController, outputChannel: PqSdkOutputChannel): void {
    let clearedCount = 0;

    controller.items.forEach(item => {
        if (item.children.size > 0) {
            item.children.replace([]);
            item.canResolveChildren = true;
            clearedCount++;
        }
    });

    const message = resolveI18nTemplate("PQSdk.testAdapter.testsCleared", { clearedCount: clearedCount.toString() });

    outputChannel.appendDebugLine(message);
}

/**
 * Recreates a parent test item and its single child to work around VS Code Test Explorer UI issues.
 * This function deletes the original parent, creates new instances of both parent and child,
 * and reveals the child in the Test Explorer.
 *
 * @param parentItem - The parent test item to recreate
 * @param controller - The test controller
 * @returns The newly created child test item, or undefined if recreation failed
 */
function recreateParentWithSingleChild(
    parentItem: vscode.TestItem,
    controller: vscode.TestController,
): vscode.TestItem | undefined {
    if (parentItem.children.size !== 1) {
        return undefined;
    }

    // Save parent properties
    const parentUri = parentItem.uri;
    const parentId = parentItem.id;
    const parentLabel = parentItem.label;

    // Save child properties
    const originalChild = Array.from(parentItem.children)[0][1];
    const childUri = originalChild.uri;
    const childLabel = originalChild.label;
    const childId = originalChild.id;

    if (!childUri) {
        return undefined;
    }

    // Delete the original parent item from the controller
    controller.items.delete(parentId);

    // Recreate the parent item
    const newParent = createTestItem(
        controller,
        parentId,
        parentLabel,
        parentUri,
        false, // canResolveChildren - already resolved
        undefined, // sortText
        undefined, // no parent (root level item)
    );

    // Explicitly add to controller since we removed it
    controller.items.add(newParent);

    // Recreate the child under the new parent
    const newChild = createTestItem(
        controller,
        childId,
        childLabel,
        childUri,
        false, // canResolveChildren
        undefined, // sortText
        newParent, // parent
    );

    return newChild;
}

/**
 * Expands a test settings item in the UI by revealing its children
 * @param delayBeforeReveal - Optional delay in milliseconds before revealing single-child items (useful for batch operations)
 * @param cancellationToken - Optional cancellation token to stop expansion early
 */
async function expandTestSettingsItem(
    testItem: vscode.TestItem,
    controller: vscode.TestController,
    delayBeforeReveal: number = 0,
    cancellationToken?: vscode.CancellationToken,
): Promise<void> {
    // Early exit if cancelled
    if (cancellationToken?.isCancellationRequested) {
        return;
    }

    if (!testItem || !testItem.uri) {
        return;
    }

    // Auto-expand the item in the UI by revealing the first child
    if (testItem.children.size === 1) {
        const singleChild = Array.from(testItem.children)[0][1];
        const isFolder = singleChild.children.size > 0;

        if (isFolder) {
            // If single child is a folder, reveal its first child to expand it
            const grandChild = Array.from(singleChild.children)[0][1];

            await vscode.commands.executeCommand(
                ExtensionConstants.TestAdapter.RevealTestInExplorerCommand,
                grandChild,
            );

            await new Promise(resolve => setTimeout(resolve, DELAY_FOR_UI_REVEAL_MS));
        } else {
            // Special handling for single test file to work around potential VS Code UI issue
            const newChild = recreateParentWithSingleChild(testItem, controller);

            if (newChild) {
                if (delayBeforeReveal > 0) {
                    await new Promise(resolve => setTimeout(resolve, delayBeforeReveal));
                }

                await vscode.commands.executeCommand(
                    ExtensionConstants.TestAdapter.RevealTestInExplorerCommand,
                    newChild,
                );
            }
        }
    } else if (testItem.children.size > 0) {
        // Expand all folders by revealing their first child
        let hasAnyFolder = false;

        for (const [, child] of testItem.children) {
            // Check cancellation before each reveal operation
            if (cancellationToken?.isCancellationRequested) {
                return;
            }

            if (child.children.size > 0) {
                hasAnyFolder = true;
                // Child is a folder - get its first child and reveal it to expand the folder
                const grandChild = Array.from(child.children)[0][1];

                await vscode.commands.executeCommand(
                    ExtensionConstants.TestAdapter.RevealTestInExplorerCommand,
                    grandChild,
                );

                // Small delay to allow UI to process the reveal command
                await new Promise(resolve => setTimeout(resolve, DELAY_FOR_UI_REVEAL_MS));
            }
        }

        // If there are no folders (only test files at root), reveal the first test file
        if (!hasAnyFolder && !cancellationToken?.isCancellationRequested) {
            const firstChild = Array.from(testItem.children)[0][1];

            await vscode.commands.executeCommand(
                ExtensionConstants.TestAdapter.RevealTestInExplorerCommand,
                firstChild,
            );
        }
    }
}

/**
 * Wrapper for refreshSettingsItem that provides progress UI and cancellation support.
 * This is the entry point from the command registration.
 */
async function refreshSettingsItemWithProgress(
    testItem: vscode.TestItem,
    controller: vscode.TestController,
    outputChannel: PqSdkOutputChannel,
): Promise<void> {
    if (!testItem) {
        return;
    }

    const progressTitle = resolveI18nTemplate("PQSdk.testAdapter.discoveringTestsForItem", { label: testItem.label });

    return vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: progressTitle,
            cancellable: true,
        },
        async (progress, cancellationToken) => {
            await refreshSettingsItem(
                testItem,
                controller,
                outputChannel,
                false, // skipReveal = false (we want to expand UI)
                cancellationToken,
            );
        },
    );
}

/**
 * Refreshes a single test settings item by triggering discovery and optionally expanding it in the UI
 */
export async function refreshSettingsItem(
    testItem: vscode.TestItem,
    controller: vscode.TestController,
    outputChannel: PqSdkOutputChannel,
    skipReveal: boolean = false,
    cancellationToken?: vscode.CancellationToken,
): Promise<void> {
    // Early exit if cancelled
    if (cancellationToken?.isCancellationRequested) {
        return;
    }

    if (!testItem || !testItem.uri) {
        // Todo: log
        return;
    }

    const label = testItem.label;

    const startMessage = resolveI18nTemplate("PQSdk.testAdapter.refreshingTestSettingsItem", { label });

    outputChannel.appendDebugLine(startMessage);

    try {
        // Clear existing children and any previous error state
        testItem.children.replace([]);
        // Todo: verify if this is needed, as we clear errors in resolveTestItem
        testItem.error = undefined;

        // Trigger test discovery via resolveTestItem
        await resolveTestItem(testItem, controller, outputChannel, cancellationToken);

        // Auto-expand the item in the UI (unless skipped for batch operations)
        if (!skipReveal && !cancellationToken?.isCancellationRequested) {
            await expandTestSettingsItem(testItem, controller, 0, cancellationToken);
        }

        const successMessage = resolveI18nTemplate("PQSdk.testAdapter.testSettingsItemRefreshed", { label });

        outputChannel.appendDebugLine(successMessage);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        const logMessage = resolveI18nTemplate("PQSdk.testAdapter.error.failedToRefreshTestSettingsItem", {
            label,
            errorMessage,
        });

        outputChannel.appendErrorLine(logMessage);

        const userMessage = resolveI18nTemplate("PQSdk.testAdapter.error.failedToRefreshTestSettingsItemUserMessage", {
            label,
        });

        vscode.window.showErrorMessage(userMessage);
    }
}

// This is currently hardcoded to look for a .pqout file in the same directory, which shows the expected
// output for the test. This provides a quick way to view what the test expects as output.
async function showExpectedOutputFile(testItem?: vscode.TestItem): Promise<void> {
    if (!testItem || !testItem.uri) {
        return;
    }

    const filePath: string = getOutputFilePathForTestItem(testItem);

    if (await fileExists(filePath)) {
        const outputFileUri: vscode.Uri = vscode.Uri.file(filePath);
        await vscode.window.showTextDocument(outputFileUri, { preview: true, preserveFocus: true });
    } else {
        await vscode.window.showInformationMessage(
            resolveI18nTemplate("PQSdk.testAdapter.outputFileNotFound", { filePath }),
        );
    }
}

/**
 * Triggers test re-discovery for all top-level test items (test settings files).
 * Uses a two-phase approach: concurrent discovery followed by sequential UI expansion.
 * Sequential expansion avoids VS Code UI race conditions and ensures all items are reliably revealed.
 *
 * This is a wrapper that provides progress UI and cancellation support.
 */
export async function refreshAllTests(
    controller: vscode.TestController,
    outputChannel: PqSdkOutputChannel,
): Promise<void> {
    // Guard against concurrent refreshes
    if (isRefreshInProgress) {
        const message = extensionI18n["PQSdk.testAdapter.refreshAlreadyInProgress"];
        vscode.window.showWarningMessage(message);

        return;
    }

    isRefreshInProgress = true;

    try {
        return await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: extensionI18n["PQSdk.testAdapter.startingTestDiscovery"],
                cancellable: true,
            },
            async (progress, cancellationToken) =>
                await refreshAllTestsInternal(controller, outputChannel, progress, cancellationToken),
        );
    } finally {
        isRefreshInProgress = false;
    }
}

/**
 * Internal implementation of test discovery with cancellation support.
 * Separated from the public wrapper to allow for testing and token injection.
 */
async function refreshAllTestsInternal(
    controller: vscode.TestController,
    outputChannel: PqSdkOutputChannel,
    progress: vscode.Progress<{ increment?: number; message?: string }>,
    cancellationToken: vscode.CancellationToken,
): Promise<void> {
    const startMessage = extensionI18n["PQSdk.testAdapter.startingTestDiscovery"];
    outputChannel.appendInfoLine(startMessage);

    try {
        // ====================================================================
        // Phase 1: Run all discoveries concurrently (skip reveal to avoid timing issues)
        // ====================================================================
        progress.report({
            increment: 0,
            message: extensionI18n["PQSdk.testAdapter.loadingTestSettings"],
        });

        const refreshPromises: Promise<void>[] = [];

        controller.items.forEach(item => {
            refreshPromises.push(refreshSettingsItem(item, controller, outputChannel, true, cancellationToken));
        });

        await Promise.all(refreshPromises);

        // Check cancellation after Phase 1
        if (cancellationToken.isCancellationRequested) {
            outputChannel.appendInfoLine(extensionI18n["PQSdk.testAdapter.testDiscoveryCancelled"]);

            return;
        }

        // ====================================================================
        // Phase 2: Expand all items sequentially to avoid UI race conditions
        // ====================================================================
        progress.report({
            increment: 40,
            message: extensionI18n["PQSdk.testAdapter.expandingTestItems"],
        });

        // Create a snapshot to avoid issues with collection modification during iteration
        const items: vscode.TestItem[] = [];
        controller.items.forEach(item => items.push(item));

        // Sort items alphabetically by label for consistent, predictable expansion order
        items.sort((a, b) => a.label.localeCompare(b.label));

        const totalItems = items.length;
        let completed = 0;

        for (const item of items) {
            // Check cancellation at loop boundary
            if (cancellationToken.isCancellationRequested) {
                const cancelMessage = resolveI18nTemplate("PQSdk.testAdapter.testDiscoveryCancelledAfterItems", {
                    completed: completed.toString(),
                    total: totalItems.toString(),
                });

                outputChannel.appendInfoLine(cancelMessage);

                return;
            }

            // Use delay for single-child items to give UI time to register recreated items
            await expandTestSettingsItem(item, controller, DELAY_BEFORE_SINGLE_CHILD_REVEAL_MS, cancellationToken);

            completed++;

            progress.report({
                increment: 60 / totalItems,
                message: `Expanded ${completed}/${totalItems} test settings`,
            });
        }

        const itemsWithErrors: vscode.TestItem[] = [];

        controller.items.forEach(item => {
            if (item.error) {
                itemsWithErrors.push(item);
            }
        });

        const totalCount = controller.items.size;
        const failedCount = itemsWithErrors.length;

        if (failedCount === 0) {
            // All discoveries succeeded
            const successMessage = extensionI18n["PQSdk.testAdapter.testDiscoveryCompleted"];
            outputChannel.appendInfoLine(successMessage);
            vscode.window.showInformationMessage(successMessage);
        } else {
            // Some discoveries failed
            const logMessage = resolveI18nTemplate("PQSdk.testAdapter.testDiscoveryCompletedWithErrors", {
                failedCount: failedCount.toString(),
                totalCount: totalCount.toString(),
            });

            outputChannel.appendInfoLine(logMessage);

            // Log details of each failed item
            itemsWithErrors.forEach(item => {
                outputChannel.appendDebugLine(`  - ${item.label}: ${item.error}`);
            });

            const userMessage = extensionI18n["PQSdk.testAdapter.testDiscoveryCompletedWithErrorsUserMessage"];
            vscode.window.showWarningMessage(userMessage);
        }
    } catch (error) {
        // Check if cancellation caused the error
        if (cancellationToken.isCancellationRequested) {
            outputChannel.appendInfoLine(extensionI18n["PQSdk.testAdapter.testDiscoveryCancelled"]);

            return;
        }

        const errorMessage = error instanceof Error ? error.message : String(error);

        const logMessage = resolveI18nTemplate("PQSdk.testAdapter.error.testDiscoveryFailed", { errorMessage });

        outputChannel.appendErrorLine(logMessage);

        const userMessage = extensionI18n["PQSdk.testAdapter.error.testDiscoveryFailedUserMessage"];
        vscode.window.showErrorMessage(userMessage);
    }
}

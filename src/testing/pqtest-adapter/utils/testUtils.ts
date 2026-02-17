/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

/**
 * Test utilities for the Power Query SDK Test extension.
 * Centralized functions for creating and manipulating VS Code TestItems.
 *
 * Pure composite ID functions are implemented in ../core/compositeId.ts and re-exported here.
 * This file contains VS Code-specific wrappers that use vscode.TestItem and other VS Code types.
 */

import * as vscode from "vscode";

import { getNormalizedUriString } from "./pathUtils";

// Re-export pure function from core module
export { parseCompositeId } from "../core/compositeId";

// Import for internal use
import { createCompositeId as createCompositeIdCore } from "../core/compositeId";

/**
 * Creates a VS Code TestItem with the given parameters and optional configuration.
 *
 * @param controller - The VS Code TestController
 * @param id - The unique identifier for the test item
 * @param label - The display label for the test item
 * @param uri - The URI associated with the test item (can be undefined)
 * @param canResolveChildren - Whether the test item can resolve children (optional)
 * @param sortText - Sort text for ordering (optional)
 * @param parentItem - Parent item to automatically add this item to (optional)
 * @returns The created TestItem
 */
export function createTestItem(
    controller: vscode.TestController,
    id: string,
    label: string,
    uri?: vscode.Uri,
    canResolveChildren?: boolean,
    sortText?: string,
    parentItem?: vscode.TestItem,
): vscode.TestItem {
    const testItem: vscode.TestItem = controller.createTestItem(id, label, uri);

    // Set optional properties if provided
    if (canResolveChildren !== undefined) {
        testItem.canResolveChildren = canResolveChildren;
    }

    if (sortText) {
        testItem.sortText = sortText;
    }

    // Automatically add to parent if provided
    if (parentItem) {
        parentItem.children.add(testItem);
    }

    return testItem;
}

/**
 * Helper function to get all leaf test items under a parent item.
 * Recursively traverses the test item tree to find all nodes without children.
 *
 * @param item - The parent test item to start traversing from
 * @returns Array of leaf test items (items with no children)
 */
export function getLeafNodes(item: vscode.TestItem): vscode.TestItem[] {
    const leaves: vscode.TestItem[] = [];

    if (item.children.size === 0) {
        // This is a leaf node
        leaves.push(item);
    } else {
        // Recursively get leaves from children
        item.children.forEach((child: vscode.TestItem) => {
            leaves.push(...getLeafNodes(child));
        });
    }

    return leaves;
}

/**
 * Creates a composite ID using normalized URI strings for consistency.
 * The composite ID format is: "originalTestId|normalizedSettingsFileUri"
 *
 * @param originalTestId - The original test item ID
 * @param settingsFileUri - The settings file URI
 * @returns The composite ID string
 * @throws Error if settingsFileUri is null or undefined
 */
export function createCompositeId(originalTestId: string, settingsFileUri: vscode.Uri): string {
    if (!settingsFileUri) {
        throw new Error("settingsFileUri is required for createCompositeId");
    }

    const normalizedSettingsUri: string = getNormalizedUriString(settingsFileUri);

    // Delegate to core function
    return createCompositeIdCore(originalTestId, normalizedSettingsUri);
}

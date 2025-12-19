/**
 * Test utilities for the Power Query SDK Test extension.
 * Centralized functions for creating and manipulating VS Code TestItems.
 */

import * as vscode from "vscode";
import { getNormalizedUriString } from "./pathUtils";

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
    parentItem?: vscode.TestItem
): vscode.TestItem {
    const testItem = controller.createTestItem(id, label, uri);

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
        item.children.forEach(child => {
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
 */
export function createCompositeId(originalTestId: string, settingsFileUri: vscode.Uri): string {
    const normalizedSettingsUri = getNormalizedUriString(settingsFileUri);
    return `${originalTestId}|${normalizedSettingsUri}`;
}

/**
 * Parses a composite ID to extract the original test ID and normalized settings file URI.
 * The composite ID format is: "originalTestId|settingsFileUri"
 * 
 * @param compositeId - The composite ID string to parse
 * @returns Object with originalTestId and normalized settingsFileUri, or null if parsing fails
 */
export function parseCompositeId(compositeId: string): { originalTestId: string; settingsFileUri: string } | null {
    const parts = compositeId.split('|');
    if (parts.length === 2) {
        return {
            originalTestId: parts[0],
            settingsFileUri: parts[1] // This should already be normalized when created with createCompositeId
        };
    }
    return null;
}

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

/**
 * Pure functions for creating and parsing composite IDs.
 * These functions have ZERO vscode dependencies to enable unit testing with plain Mocha.
 *
 * Composite IDs are used to uniquely identify test items by combining
 * the original test ID with the settings file URI.
 * Format: "originalTestId|settingsFileUri"
 */

/**
 * Parsed composite ID containing the original test ID and settings file URI.
 */
export interface CompositeIdParts {
    originalTestId: string;
    settingsFileUri: string;
}

/**
 * Creates a composite ID by combining the original test ID with the settings file URI.
 * The composite ID format is: "originalTestId|normalizedSettingsFileUri"
 *
 * @param originalTestId - The original test item ID
 * @param normalizedSettingsFileUri - The normalized settings file URI string
 * @returns The composite ID string
 */
export function createCompositeId(originalTestId: string, normalizedSettingsFileUri: string): string {
    return `${originalTestId}|${normalizedSettingsFileUri}`;
}

/**
 * Parses a composite ID to extract the original test ID and normalized settings file URI.
 * The composite ID format is: "originalTestId|settingsFileUri"
 *
 * @param compositeId - The composite ID string to parse
 * @returns Object with originalTestId and settingsFileUri, or null if parsing fails
 */
export function parseCompositeId(compositeId: string): CompositeIdParts | null {
    const parts: string[] = compositeId.split("|");

    if (parts.length === 2) {
        return {
            originalTestId: parts[0],
            settingsFileUri: parts[1],
        };
    }

    return null;
}

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as path from "path";

import * as vscode from "vscode";

import { ExtensionConstants } from "../../../constants/PowerQuerySdkExtension";
import { PqSdkOutputChannel } from "../../../features/PqSdkOutputChannel";
import { extensionI18n, resolveI18nTemplate } from "../../../i18n/extension";
import { getTestPathFromSettings } from "./testSettingsUtils";

// Re-export pure path functions from core module
export { getNormalizedPath, splitPath, joinPath, getParentPath, changeFileExtension } from "../core/pathOperations";

// Import for internal use in this file
import { changeFileExtension, getNormalizedPath, splitPathPreservingCaseParts } from "../core/pathOperations";

/**
 * Path utilities for handling file and folder paths in the Power Query SDK Test extension.
 * Provides consistent path manipulation across different operating systems.
 *
 * Pure path functions are implemented in ../core/pathOperations.ts and re-exported here.
 * This file contains VS Code-specific wrappers that use vscode.Uri and other VS Code types.
 */

/**
 * Gets a normalized string representation of a VS Code URI for consistent use as identifiers,
 * map keys, and comparisons. This ensures cross-platform consistency.
 *
 * @param uri The VS Code URI to normalize.
 * @returns The normalized URI string.
 */
export function getNormalizedUriString(uri: vscode.Uri): string {
    return getNormalizedPath(uri.fsPath);
}

/**
 * Splits a path into normalized parts (for IDs) and original parts (for labels).
 * This allows us to preserve original case for display while using normalized paths for operations.
 *
 * @param filePath - The file path to split
 * @param outputChannel - Optional output channel for logging warnings
 * @returns Object with normalizedParts (for IDs) and originalParts (for labels)
 */
export function splitPathPreservingCase(
    filePath: string,
    outputChannel?: PqSdkOutputChannel,
): { normalizedParts: string[]; originalParts: string[] } {
    // Delegate to core function for the pure logic
    const result = splitPathPreservingCaseParts(filePath);

    // Safety check: if structure doesn't match, fall back to normalized for both
    if (result.originalParts.length !== result.normalizedParts.length) {
        const message: string = resolveI18nTemplate("PQSdk.testAdapter.pathStructureMismatch", {
            filePath,
            originalCount: result.originalParts.length.toString(),
            normalizedCount: result.normalizedParts.length.toString(),
        });

        outputChannel?.appendDebugLine(message);

        return { normalizedParts: result.normalizedParts, originalParts: result.normalizedParts };
    }

    return result;
}

/**
 * Gets the output file path for a test item by changing the extension to .pqout
 */
export function getOutputFilePathForTestItem(test: vscode.TestItem): string {
    if (!test.uri) {
        throw new Error(extensionI18n["PQSdk.testAdapter.error.testItemUriNotSet"]);
    }

    return getOutputFilePathForUri(test.uri);
}

/**
 * Gets the output file path for a URI by changing the extension to .pqout
 */
export function getOutputFilePathForUri(uri: vscode.Uri): string {
    return changeFileExtension(uri.fsPath, ExtensionConstants.TestAdapter.OutputFileEnding);
}

/**
 * Calculates the relative path from the QueryFilePath base directory to a test item.
 * The QueryFilePath is defined in the settings file and serves as the base directory.
 *
 * @param testItemUri - URI of the test item (.query.pq file)
 * @param settingsFileUri - URI of the settings file (.testsettings.json)
 * @returns Relative path from QueryFilePath base directory to test file, normalized for command line use
 */
export async function getRelativeTestPath(testItemUri: vscode.Uri, settingsFileUri: vscode.Uri): Promise<string> {
    try {
        // Get the QueryFilePath (base directory) from settings
        const queryFilePath: string = await getTestPathFromSettings(settingsFileUri.fsPath);

        // Calculate relative path from QueryFilePath to the test file
        const relativePath: string = path.relative(queryFilePath, testItemUri.fsPath);

        // Normalize the path to use forward slashes for consistent use across platforms
        return getNormalizedPath(relativePath);
    } catch (error) {
        const errorMessage: string = error instanceof Error ? error.message : String(error);

        const message: string = resolveI18nTemplate("PQSdk.testAdapter.error.calculatingRelativePath", {
            testFilePath: testItemUri.fsPath,
            errorMessage,
        });

        throw new Error(message);
    }
}

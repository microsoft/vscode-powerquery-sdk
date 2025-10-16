import * as path from "path";
import * as vscode from "vscode";

import { ExtensionConstants } from "../../../constants/PowerQuerySdkExtension";
import { extensionI18n, resolveI18nTemplate } from "../../../i18n/extension";
import { PqSdkOutputChannel } from "../../../features/PqSdkOutputChannel";
import { getTestPathFromSettings } from "./testSettingsUtils";

/**
 * Path utilities for handling file and folder paths in the Power Query SDK Test extension.
 * Provides consistent path manipulation across different operating systems.
 */

/**
 * Normalizes a path for comparison purposes. It replaces backslashes with forward slashes,
 * and on Windows, it converts the path to lowercase to handle case-insensitivity.
 *
 * @param filePath The path to normalize.
 * @returns The normalized path.
 */
export function getNormalizedPath(filePath: string): string {
    if (!filePath) {
        return "";
    }

    let normalizedPath = path.normalize(filePath).replace(/\\/g, "/");

    // For Windows, convert to lower case for case-insensitive comparison
    if (process.platform === "win32") {
        normalizedPath = normalizedPath.toLowerCase();
    }

    return normalizedPath;
}

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
    outputChannel?: PqSdkOutputChannel
): { normalizedParts: string[], originalParts: string[] } {
    if (!filePath) {
        return { normalizedParts: [], originalParts: [] };
    }

    // Get normalized parts for IDs and operations
    const normalizedParts = splitPath(filePath);

    // Get original parts for display labels, handling both / and \ separators
    const originalParts = filePath.split(/[/\\]/).filter(part =>
        part.length > 0 && part !== '.' && part !== '..'
    );

    // Safety check: if structure doesn't match, fall back to normalized for both
    if (originalParts.length !== normalizedParts.length) {
        const message = resolveI18nTemplate(
            "PQSdk.testAdapter.pathStructureMismatch",
            {
                filePath,
                originalCount: originalParts.length.toString(),
                normalizedCount: normalizedParts.length.toString()
            }
        );
        outputChannel?.appendDebugLine(message);
        return { normalizedParts, originalParts: normalizedParts };
    }

    return { normalizedParts, originalParts };
}

/**
 * Changes the file extension of a file path
 */
export function changeFileExtension(file: string, extension: string): string {
    const basename: string = path.basename(file, path.extname(file));
    return path.join(path.dirname(file), basename + extension);
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
 * Splits a normalized path into its component parts, filtering out empty parts
 * @param filePath The path to split
 * @returns Array of path components
 */
export function splitPath(filePath: string): string[] {
    if (!filePath) {
        return [];
    }
    const normalized = getNormalizedPath(filePath);
    return normalized.split('/').filter(part => part.length > 0);
}

/**
 * Joins path parts with forward slashes, handling empty parts gracefully
 * @param parts The path parts to join
 * @returns The joined path
 */
export function joinPath(...parts: string[]): string {
    return parts.filter(part => part && part.length > 0).join('/');
}

/**
 * Extracts the parent directory from a path
 * @param filePath The file path
 * @returns The parent directory path, or empty string for root-level files
 */
export function getParentPath(filePath: string): string {
    if (!filePath) {
        return '';
    }
    let normalized = getNormalizedPath(filePath);

    // If the path ends with a slash and isn't just the root "/", remove it
    if (normalized.endsWith('/') && normalized.length > 1) {
        normalized = normalized.substring(0, normalized.length - 1);
    }

    const lastSlashIndex = normalized.lastIndexOf('/');
    if (lastSlashIndex === -1) {
        return ''; // No parent directory (root level)
    }
    return normalized.substring(0, lastSlashIndex);
}

/**
 * Calculates the relative path from the QueryFilePath base directory to a test item.
 * The QueryFilePath is defined in the settings file and serves as the base directory.
 * 
 * @param testItemUri - URI of the test item (.query.pq file)
 * @param settingsFileUri - URI of the settings file (.testsettings.json)
 * @returns Relative path from QueryFilePath base directory to test file, normalized for command line use
 */
export async function getRelativeTestPath(
    testItemUri: vscode.Uri,
    settingsFileUri: vscode.Uri
): Promise<string> {
    try {
        // Get the QueryFilePath (base directory) from settings
        const queryFilePath = await getTestPathFromSettings(settingsFileUri.fsPath);

        // Calculate relative path from QueryFilePath to the test file
        const relativePath = path.relative(queryFilePath, testItemUri.fsPath);

        // Normalize the path to use forward slashes for consistent use across platforms
        return getNormalizedPath(relativePath);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const message = resolveI18nTemplate(
            "PQSdk.testAdapter.error.calculatingRelativePath",
            {
                testFilePath: testItemUri.fsPath,
                errorMessage
            }
        );
        throw new Error(message);
    }
}

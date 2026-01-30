/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as path from "path";

/**
 * Path manipulation functions for pqtest-adapter.
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

    let normalizedPath: string = path.normalize(filePath).replace(/\\/g, "/");

    // For Windows, convert to lower case for case-insensitive comparison
    if (process.platform === "win32") {
        normalizedPath = normalizedPath.toLowerCase();
    }

    return normalizedPath;
}

/**
 * Splits a normalized path into its component parts, filtering out empty parts.
 *
 * @param filePath The path to split
 * @returns Array of path components
 */
export function splitPath(filePath: string): string[] {
    if (!filePath) {
        return [];
    }

    const normalized: string = getNormalizedPath(filePath);

    return normalized.split("/").filter((part: string): boolean => part.length > 0);
}

/**
 * Joins path parts with forward slashes, handling empty parts gracefully.
 *
 * @param parts The path parts to join
 * @returns The joined path
 */
export function joinPath(...parts: string[]): string {
    return parts.filter((part: string): boolean => Boolean(part) && part.length > 0).join("/");
}

/**
 * Extracts the parent directory from a path.
 *
 * @param filePath The file path
 * @returns The parent directory path, or empty string for root-level files
 */
export function getParentPath(filePath: string): string {
    if (!filePath) {
        return "";
    }

    let normalized: string = getNormalizedPath(filePath);

    // If the path ends with a slash and isn't just the root "/", remove it
    if (normalized.endsWith("/") && normalized.length > 1) {
        normalized = normalized.substring(0, normalized.length - 1);
    }

    const lastSlashIndex: number = normalized.lastIndexOf("/");

    if (lastSlashIndex === -1) {
        return ""; // No parent directory (root level)
    }

    return normalized.substring(0, lastSlashIndex);
}

/**
 * Changes the file extension of a file path.
 *
 * @param file The file path
 * @param extension The new extension (including the dot, e.g., ".pqout")
 * @returns The file path with the new extension
 */
export function changeFileExtension(file: string, extension: string): string {
    const basename: string = path.basename(file, path.extname(file));

    return path.join(path.dirname(file), basename + extension);
}

/**
 * Splits a path into parts, returning both normalized parts (for IDs) and original parts (for labels).
 * This allows preserving original case for display while using normalized paths for operations.
 *
 * @param filePath - The file path to split
 * @returns Object with normalizedParts (for IDs) and originalParts (for labels)
 */
export function splitPathPreservingCaseParts(filePath: string): { normalizedParts: string[]; originalParts: string[] } {
    if (!filePath) {
        return { normalizedParts: [], originalParts: [] };
    }

    // Get normalized parts for IDs and operations
    const normalizedParts: string[] = splitPath(filePath);

    // Get original parts for display labels, handling both / and \ separators
    const originalParts: string[] = filePath
        .split(/[/\\]/)
        .filter((part: string): boolean => part.length > 0 && part !== "." && part !== "..");

    return { normalizedParts, originalParts };
}

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

/**
 * Pure validation functions for QueryFilePath field.
 * These functions have no vscode dependencies to enable unit testing with plain Mocha.
 */

/**
 * Error codes for QueryFilePath validation failures.
 */
export type QueryFilePathErrorCode = "missing" | "invalid-type" | "empty" | "whitespace-only";

/**
 * Result of QueryFilePath validation.
 */
export interface QueryFilePathValidationResult {
    isValid: boolean;
    errorCode?: QueryFilePathErrorCode;
    error?: string;
}

/**
 * Validates the QueryFilePath field value from a parsed JSON settings file.
 *
 * @param value - The raw value from JSON (could be any type)
 * @returns Validation result with isValid flag and optional error details
 */
export function validateQueryFilePathField(value: unknown): QueryFilePathValidationResult {
    // Check for missing/undefined/null
    if (value === undefined || value === null) {
        return {
            isValid: false,
            errorCode: "missing",
            error: "QueryFilePath property is missing",
        };
    }

    // Check for invalid type (must be string)
    if (typeof value !== "string") {
        return {
            isValid: false,
            errorCode: "invalid-type",
            error: `QueryFilePath must be a string, got ${typeof value}`,
        };
    }

    // Check for empty string
    if (value.length === 0) {
        return {
            isValid: false,
            errorCode: "empty",
            error: "QueryFilePath cannot be empty",
        };
    }

    // Check for whitespace-only string
    if (value.trim().length === 0) {
        return {
            isValid: false,
            errorCode: "whitespace-only",
            error: "QueryFilePath cannot be whitespace-only",
        };
    }

    return { isValid: true };
}

/**
 * Checks if a file path has a valid test file ending.
 *
 * @param filePath - The file path to check
 * @param testFileEnding - The expected file ending (e.g., ".query.pq")
 * @returns True if the file path ends with the expected ending
 */
export function hasValidTestFileEnding(filePath: string, testFileEnding: string): boolean {
    if (!filePath || !testFileEnding) {
        return false;
    }

    return filePath.endsWith(testFileEnding);
}

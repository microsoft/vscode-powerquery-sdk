/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

/**
 * Result of validation operation
 */
export interface ValidationResult {
    isValid: boolean;
    error?: string;
}

/**
 * Project name validation utilities
 */
export class ProjectNameValidator {
    private static readonly PROJECT_NAME_REGEX: RegExp = /^[A-Za-z][A-Za-z0-9_]*$/;
    private static readonly RESERVED_WORDS: string[] = [
        "CON",
        "PRN",
        "AUX",
        "NUL",
        "COM1",
        "COM2",
        "COM3",
        "COM4",
        "COM5",
        "COM6",
        "COM7",
        "COM8",
        "COM9",
        "LPT1",
        "LPT2",
        "LPT3",
        "LPT4",
        "LPT5",
        "LPT6",
        "LPT7",
        "LPT8",
        "LPT9",
    ];

    /**
     * Validate project name according to Power Query SDK rules
     */
    public static validate(projectName: string): ValidationResult {
        if (!projectName || projectName.trim().length === 0) {
            return {
                isValid: false,
                error: "Project name is required",
            };
        }

        const trimmedName: string = projectName.trim();

        if (!this.PROJECT_NAME_REGEX.test(trimmedName)) {
            return {
                isValid: false,
                error: "Project name must start with a letter and contain only letters, numbers, and underscores",
            };
        }

        if (this.RESERVED_WORDS.includes(trimmedName.toUpperCase())) {
            return {
                isValid: false,
                error: `"${trimmedName}" is a reserved word and cannot be used as a project name`,
            };
        }

        if (trimmedName.length > 255) {
            return {
                isValid: false,
                error: "Project name cannot exceed 255 characters",
            };
        }

        return { isValid: true };
    }
}

/**
 * Credential validation utilities
 */
export class CredentialValidator {
    /**
     * Validate credential state for Power Query authentication
     */
    public static validateCredentialState(state: Record<string, unknown>): ValidationResult {
        if (!state.DataSourceKind) {
            return {
                isValid: false,
                error: "DataSourceKind is required",
            };
        }

        if (!state.AuthenticationKind) {
            return {
                isValid: false,
                error: "AuthenticationKind is required",
            };
        }

        // Validate Key authentication
        if (state.AuthenticationKind === "Key") {
            if (!state.$$KEY$$ || (typeof state.$$KEY$$ === "string" && state.$$KEY$$.trim().length === 0)) {
                return {
                    isValid: false,
                    error: "Key is required for Key authentication",
                };
            }
        }

        // Validate OAuth authentication
        if (state.AuthenticationKind === "OAuth") {
            if (!state.$$OAUTH_TOKEN$$) {
                return {
                    isValid: false,
                    error: "OAuth token is required for OAuth authentication",
                };
            }
        }

        // Validate Windows authentication
        if (state.AuthenticationKind === "Windows") {
            // Windows auth typically doesn't require additional fields
            // but we could add domain validation here if needed
        }

        return { isValid: true };
    }
}

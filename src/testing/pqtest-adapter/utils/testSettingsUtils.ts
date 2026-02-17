/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as path from "path";
import { TextDecoder } from "util";

import * as vscode from "vscode";

import { ExtensionConfigurations } from "../../../constants/PowerQuerySdkConfiguration";
import { ExtensionConstants } from "../../../constants/PowerQuerySdkExtension";
import { PqSdkOutputChannel } from "../../../features/PqSdkOutputChannel";
import { extensionI18n, ExtensionI18nKeys, resolveI18nTemplate } from "../../../i18n/extension";
import {
    QueryFilePathErrorCode,
    QueryFilePathValidationResult,
    validateQueryFilePathField,
} from "../core/queryFilePathValidation";
import {
    defaultFileSystemOperations,
    defaultWorkspaceOperations,
    FileSystemOperations,
    getPathType,
    WorkspaceOperations,
} from "./vscodeFs";
import { resolvePathRelativeToWorkspace, resolveSubstitutedValues } from "../../../utils/vscodes";

/**
 * Retrieves and resolves settings file URIs from configuration.
 * Handles both individual files and directories containing settings files.
 *
 * @param outputChannel - Optional output channel for logging warnings
 * @returns Array of URIs to test settings files (.testsettings.json)
 */
export async function getTestSettingsFileUris(outputChannel?: PqSdkOutputChannel): Promise<vscode.Uri[]> {
    const settingsFiles: string | string[] | undefined = ExtensionConfigurations.testSettingsFiles;
    const result: vscode.Uri[] = [];
    const testSettingsFilePattern: string = "**/*.testsettings.json";
    const testSettingsFileEnding: string = ".testsettings.json";
    const baseConfigPath: string = ExtensionConstants.ConfigNames.PowerQuerySdk.name;
    const settingsFilesConfigKey: string = ExtensionConstants.ConfigNames.PowerQuerySdk.properties.testSettingsFiles;

    if (typeof settingsFiles === "string") {
        try {
            const fileStat: vscode.FileStat = await vscode.workspace.fs.stat(vscode.Uri.file(settingsFiles));

            if (fileStat.type === vscode.FileType.Directory) {
                const pattern: vscode.RelativePattern = new vscode.RelativePattern(
                    settingsFiles,
                    testSettingsFilePattern,
                );

                const files: vscode.Uri[] = await vscode.workspace.findFiles(pattern);
                result.push(...files);
            } else if (settingsFiles.endsWith(testSettingsFileEnding)) {
                result.push(vscode.Uri.file(settingsFiles));
            } else {
                void vscode.window.showErrorMessage(
                    resolveI18nTemplate("PQSdk.testAdapter.error.incorrectFileExtension", {
                        settingsFile: settingsFiles,
                        configPath: `${baseConfigPath}.${settingsFilesConfigKey}`,
                        expectedExtension: testSettingsFileEnding,
                    }),
                );
            }
            // Ignore paths that don't exist
        } catch (e) {
            // Log errors as they might indicate real problems (permissions, network issues, etc.)
            const errorMessage: string = e instanceof Error ? e.message : String(e);

            const message: string = resolveI18nTemplate("PQSdk.testAdapter.error.accessingSettingsPath", {
                settingsPath: settingsFiles,
                errorMessage,
            });

            outputChannel?.appendDebugLine(message);
        }
    } else if (Array.isArray(settingsFiles)) {
        for (const settingsFile of settingsFiles) {
            try {
                const fileStat: vscode.FileStat = await vscode.workspace.fs.stat(vscode.Uri.file(settingsFile));

                if (fileStat.type === vscode.FileType.Directory) {
                    // Directory support: scan for all .testsettings.json files recursively
                    const pattern: vscode.RelativePattern = new vscode.RelativePattern(
                        settingsFile,
                        testSettingsFilePattern,
                    );

                    const files: vscode.Uri[] = await vscode.workspace.findFiles(pattern);
                    result.push(...files);
                } else if (settingsFile.endsWith(testSettingsFileEnding)) {
                    result.push(vscode.Uri.file(settingsFile));
                } else {
                    void vscode.window.showErrorMessage(
                        resolveI18nTemplate("PQSdk.testAdapter.error.incorrectFileExtension", {
                            settingsFile,
                            configPath: `${baseConfigPath}.${settingsFilesConfigKey}`,
                            expectedExtension: testSettingsFileEnding,
                        }),
                    );
                }

                // Ignore files that don't exist
            } catch (e) {
                // Log errors as they might indicate real problems (permissions, network issues, etc.)
                const errorMessage: string = e instanceof Error ? e.message : String(e);

                const message: string = resolveI18nTemplate("PQSdk.testAdapter.error.accessingSettingsPath", {
                    settingsPath: settingsFile,
                    errorMessage,
                });

                outputChannel?.appendDebugLine(message);
            }
        }
    }

    return result;
}

/**
 * Maps validation error codes to i18n message keys.
 */
const queryFilePathErrorCodeToI18nKey: Record<QueryFilePathErrorCode, ExtensionI18nKeys> = {
    missing: "PQSdk.testAdapter.error.queryFilePathMissing",
    "invalid-type": "PQSdk.testAdapter.error.queryFilePathInvalidType",
    empty: "PQSdk.testAdapter.error.queryFilePathEmpty",
    "whitespace-only": "PQSdk.testAdapter.error.queryFilePathWhitespaceOnly",
};

/**
 * Reads the test path from a settings file and validates that it is either a directory or a .query.pq file.
 * The path is resolved relative to the test settings file if it's not an absolute path.
 *
 * @param settingsFilePath Absolute path to the test settings file
 * @param fs File system operations (defaults to VS Code's workspace.fs)
 * @param _workspace Workspace operations (defaults to VS Code's workspace)
 * @param outputChannel Optional output channel for logging errors
 * @returns Promise that resolves to the resolved and validated test path
 */
export async function getTestPathFromSettings(
    settingsFilePath: string,
    fs: FileSystemOperations = defaultFileSystemOperations,
    _workspace: WorkspaceOperations = defaultWorkspaceOperations,
    outputChannel?: PqSdkOutputChannel,
): Promise<string> {
    let data: Uint8Array;

    try {
        data = await fs.readFile(vscode.Uri.file(settingsFilePath));
    } catch (_err) {
        const message: string = resolveI18nTemplate("PQSdk.testAdapter.error.failedToReadSettingsFile", {
            settingsFilePath,
        });

        outputChannel?.appendErrorLine(message);
        void vscode.window.showErrorMessage(message);
        throw new Error(message);
    }

    let json: any;

    try {
        const textData: string = new TextDecoder().decode(data);

        json = JSON.parse(textData);
    } catch (e) {
        const errorMessage: string = e instanceof Error ? e.message : String(e);

        const baseMessage: string = resolveI18nTemplate("PQSdk.testAdapter.error.invalidJsonInSettingsFile", {
            settingsFilePath,
        });

        const fullMessage: string = `${baseMessage}: ${errorMessage}`;
        outputChannel?.appendErrorLine(fullMessage);
        void vscode.window.showErrorMessage(fullMessage);
        throw new Error(fullMessage);
    }

    // Validate QueryFilePath field using pure validation function
    const validationResult: QueryFilePathValidationResult = validateQueryFilePathField(json.QueryFilePath);

    if (!validationResult.isValid) {
        const i18nKey: ExtensionI18nKeys = queryFilePathErrorCodeToI18nKey[validationResult.errorCode!];

        const message: string = resolveI18nTemplate(i18nKey, {
            settingsFilePath,
        });

        outputChannel?.appendErrorLine(message);
        void vscode.window.showErrorMessage(message);
        throw new Error(message);
    }

    const queryFilePathFromSettings: string = json.QueryFilePath;
    let resolvedQueryFilePath: string;

    if (path.isAbsolute(queryFilePathFromSettings)) {
        resolvedQueryFilePath = queryFilePathFromSettings;
    } else {
        // Resolve relative paths relative to the settings file directory
        const settingsFileDir: string = path.dirname(settingsFilePath);
        resolvedQueryFilePath = path.resolve(settingsFileDir, queryFilePathFromSettings);
    }

    const pathType: string = await getPathType(resolvedQueryFilePath, fs);

    switch (pathType) {
        case "directory":
            return resolvedQueryFilePath;

        case "file":
            if (resolvedQueryFilePath.endsWith(ExtensionConstants.TestAdapter.TestFileEnding)) {
                return resolvedQueryFilePath;
            } else {
                const invalidFileMessage: string = resolveI18nTemplate(
                    "PQSdk.testAdapter.error.queryFilePathMustBeDirectoryOrPqFile",
                    {
                        queryFilePath: queryFilePathFromSettings,
                        settingsFilePath,
                    },
                );

                outputChannel?.appendErrorLine(invalidFileMessage);
                void vscode.window.showErrorMessage(invalidFileMessage);
                throw new Error(invalidFileMessage);
            }

        case "not-found": {
            const notFoundMessage: string = resolveI18nTemplate("PQSdk.testAdapter.error.queryFilePathDoesNotExist", {
                queryFilePath: queryFilePathFromSettings,
                settingsFilePath,
                resolvedPath: resolvedQueryFilePath,
            });

            outputChannel?.appendErrorLine(notFoundMessage);
            void vscode.window.showErrorMessage(notFoundMessage);
            throw new Error(notFoundMessage);
        }

        default: {
            // This case should not be reachable
            const unexpectedMessage: string = resolveI18nTemplate(
                "PQSdk.testAdapter.error.unexpectedErrorCheckingPath",
                {
                    resolvedPath: resolvedQueryFilePath,
                },
            );

            outputChannel?.appendErrorLine(unexpectedMessage);
            void vscode.window.showErrorMessage(unexpectedMessage);
            throw new Error(unexpectedMessage);
        }
    }
}

/**
 * Reads ExtensionPaths array from a .testsettings.json file.
 *
 * @param settingsFilePath - Absolute path to .testsettings.json file
 * @param fs - File system operations
 * @returns Array of extension paths, or undefined if not present or invalid
 */
export async function getExtensionPathsFromSettings(
    settingsFilePath: string,
    fs: FileSystemOperations = defaultFileSystemOperations,
): Promise<string[] | undefined> {
    try {
        const data: Uint8Array = await fs.readFile(vscode.Uri.file(settingsFilePath));
        const textData: string = new TextDecoder().decode(data);
        const json: any = JSON.parse(textData);

        // Check if ExtensionPaths exists and is a non-empty array
        if (Array.isArray(json.ExtensionPaths) && json.ExtensionPaths.length > 0) {
            // Validate all elements are strings
            const allStrings: boolean = json.ExtensionPaths.every((item: any): boolean => typeof item === "string");

            if (allStrings) {
                return json.ExtensionPaths;
            }
        }

        return undefined;
    } catch (_error) {
        // File not readable, invalid JSON, or other error - return undefined
        // Caller will fall back to configuration
        return undefined;
    }
}

/**
 * Determines which extensions to use for test discovery/execution based on precedence rules.
 *
 * Precedence (highest to lowest):
 * 1. ExtensionPaths in .testsettings.json file
 * 2. powerquery.sdk.test.extensionPaths configuration
 * 3. powerquery.sdk.defaultExtension configuration (fallback)
 *
 * @param settingsFilePath - Path to .testsettings.json file
 * @param outputChannel - Optional output channel for logging
 * @returns Extension path(s) to use, or undefined to signal pqtest.exe should use settings file ExtensionPaths
 * @throws Error if no extensions are configured anywhere
 */
export async function determineExtensionsForTests(
    settingsFilePath: string,
    outputChannel?: PqSdkOutputChannel,
): Promise<string | string[] | undefined> {
    // Priority 1: Check ExtensionPaths in settings file
    try {
        const extensionPathsFromSettings: string[] | undefined = await getExtensionPathsFromSettings(settingsFilePath);

        if (extensionPathsFromSettings && extensionPathsFromSettings.length > 0) {
            const message: string = resolveI18nTemplate(
                "PQSdk.testAdapter.extensions.usingExtensionPathsFromSettingsFile",
                {
                    settingsFilePath,
                    extensionCount: extensionPathsFromSettings.length.toString(),
                },
            );

            outputChannel?.appendInfoLine(message);

            // Return undefined to signal: don't add --extension flags
            // pqtest.exe will use ExtensionPaths from the settings file
            return undefined;
        }
    } catch (error) {
        const errorMessage: string = error instanceof Error ? error.message : String(error);

        const message: string = resolveI18nTemplate(
            "PQSdk.testAdapter.extensions.failedToReadExtensionPathsFromSettings",
            {
                settingsFilePath,
                errorMessage,
            },
        );

        outputChannel?.appendErrorLine(message);
    }

    // Priority 2: Check powerquery.sdk.test.extensionPaths
    const testExtensionPaths: string | string[] | undefined = ExtensionConfigurations.TestExtensionPaths;

    if (testExtensionPaths !== undefined) {
        // Handle string case
        if (typeof testExtensionPaths === "string") {
            const trimmed = testExtensionPaths.trim();

            if (trimmed.length > 0) {
                const message = resolveI18nTemplate("PQSdk.testAdapter.extensions.usingTestExtensionPathsConfig", {
                    extensionCount: "1",
                });

                outputChannel?.appendInfoLine(message);

                return trimmed;
            }

            // Empty string - log and fall through to Priority 3
            outputChannel?.appendLine("test.extensionPaths is configured but empty, falling back to defaultExtension");
        }
        // Handle array case
        else if (Array.isArray(testExtensionPaths)) {
            // Filter out empty/whitespace-only strings
            const validPaths = testExtensionPaths
                .filter(p => typeof p === "string" && p.trim().length > 0)
                .map(p => p.trim());

            if (validPaths.length > 0) {
                // Log if we filtered any items
                if (validPaths.length < testExtensionPaths.length) {
                    const filtered = testExtensionPaths.length - validPaths.length;

                    outputChannel?.appendInfoLine(
                        `Filtered out ${filtered} empty extension path(s) from test.extensionPaths configuration`,
                    );
                }

                const message = resolveI18nTemplate("PQSdk.testAdapter.extensions.usingTestExtensionPathsConfig", {
                    extensionCount: validPaths.length.toString(),
                });

                outputChannel?.appendInfoLine(message);

                return validPaths;
            }

            // All empty - log and fall through to Priority 3
            outputChannel?.appendInfoLine(
                "powerquery.sdk.test.extensionPaths array is configured but all paths are empty, falling back to defaultExtension",
            );
        }
    }

    // Priority 3: Fallback to powerquery.sdk.defaultExtension
    const defaultExtension: string | undefined = resolveSubstitutedValues(
        ExtensionConfigurations.DefaultExtensionLocation,
    );

    if (defaultExtension) {
        // Substitute variables and resolve path relative to workspace folder
        const resolved = resolvePathRelativeToWorkspace(resolveSubstitutedValues(defaultExtension));

        if (resolved) {
            const message = resolveI18nTemplate("PQSdk.testAdapter.extensions.fallingBackToDefaultExtension", {
                extensionPath: resolved,
            });

            outputChannel?.appendInfoLine(message);

            return resolved;
        }
    }

    // ERROR: No extensions configured anywhere
    throw new Error(extensionI18n["PQSdk.testAdapter.extensions.noExtensionsConfigured"]);
}

/**
 * Builds command-line arguments for intermediate test results persistence.
 *
 * Always enables persistence and sets the intermediate results folder.
 *
 * Folder path precedence:
 * 1. testsettings.json "IntermediateTestResultsFolder" (if defined)
 * 2. VS Code config "powerquery.sdk.test.defaultIntermediateResultsFolder" (if defined)
 * 3. Hard-coded default: "../TestResults"
 *
 * @param settingsFilePath - Path to .testsettings.json file
 * @param outputChannel - Optional output channel for debug logging
 * @param fs - File system operations
 * @returns Array of command-line arguments to append
 */
export async function buildIntermediateResultsArgs(
    settingsFilePath: string,
    outputChannel?: PqSdkOutputChannel,
    fs: FileSystemOperations = defaultFileSystemOperations,
): Promise<string[]> {
    const args: string[] = [];

    // Always enable persistence
    args.push("--persistIntermediateTestResults");

    // Read testsettings.json
    const config = await readIntermediateResultsConfig(settingsFilePath, outputChannel, fs);

    // Determine folder path with precedence
    let folderPath: string;

    if (config.intermediateTestResultsFolder !== undefined) {
        // Priority 1: Use value from testsettings.json
        folderPath = config.intermediateTestResultsFolder;

        outputChannel?.appendDebugLine(
            resolveI18nTemplate("PQSdk.testAdapter.intermediateResults.usingFolderFromSettings", {
                settingsFilePath,
                folderPath,
            }),
        );
    } else {
        // Priority 2: Check VS Code config
        const configValue = ExtensionConfigurations.DefaultIntermediateResultsFolder;

        if (configValue && configValue.trim().length > 0) {
            folderPath = configValue.trim();

            outputChannel?.appendDebugLine(
                resolveI18nTemplate("PQSdk.testAdapter.intermediateResults.usingFolderFromConfig", {
                    folderPath,
                }),
            );
        } else {
            // Priority 3: Hard-coded constant
            folderPath = ExtensionConstants.TestAdapter.DefaultIntermediateResultsFolder;

            outputChannel?.appendDebugLine(extensionI18n["PQSdk.testAdapter.intermediateResults.usingDefaultFolder"]);
        }
    }

    args.push("--intermediateTestResultsFolder", folderPath);

    // Log final configuration
    outputChannel?.appendInfoLine(
        resolveI18nTemplate("PQSdk.testAdapter.intermediateResults.finalConfig", {
            persist: "true",
            folder: folderPath,
        }),
    );

    return args;
}

/**
 * Helper to read intermediate results config from testsettings.json.
 * Returns undefined if not present or if file cannot be read.
 */
async function readIntermediateResultsConfig(
    settingsFilePath: string,
    outputChannel?: PqSdkOutputChannel,
    fs: FileSystemOperations = defaultFileSystemOperations,
): Promise<{
    intermediateTestResultsFolder?: string;
}> {
    try {
        const data = await fs.readFile(vscode.Uri.file(settingsFilePath));
        const textData = new TextDecoder().decode(data);
        const json = JSON.parse(textData);

        return {
            intermediateTestResultsFolder:
                typeof json.IntermediateTestResultsFolder === "string" ? json.IntermediateTestResultsFolder : undefined,
        };
    } catch (error) {
        // Log debug message about fallback
        const errorMessage = error instanceof Error ? error.message : String(error);

        outputChannel?.appendDebugLine(
            resolveI18nTemplate("PQSdk.testAdapter.intermediateResults.failedToReadSettings", {
                settingsFilePath,
                errorMessage,
            }),
        );

        outputChannel?.appendDebugLine(extensionI18n["PQSdk.testAdapter.intermediateResults.fallingBackToDefaults"]);

        // Return empty config - caller will use default
        return {};
    }
}

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as path from "path";
import * as vscode from "vscode";

import { ExtensionConfigurations } from "../../../constants/PowerQuerySdkConfiguration";
import { ExtensionConstants } from "../../../constants/PowerQuerySdkExtension";
import { extensionI18n, resolveI18nTemplate } from "../../../i18n/extension";
import { PqSdkOutputChannel } from "../../../features/PqSdkOutputChannel";
import { resolveSubstitutedValues } from "../../../utils/vscodes";
import {
    FileSystemOperations,
    WorkspaceOperations,
    defaultFileSystemOperations,
    defaultWorkspaceOperations,
    getPathType,
} from "../../../utils/files";

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
            } else {
                if (settingsFiles.endsWith(testSettingsFileEnding)) {
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
            }
            // Ignore paths that don't exist
        } catch (e) {
            // Log errors as they might indicate real problems (permissions, network issues, etc.)
            const errorMessage = e instanceof Error ? e.message : String(e);
            const message = resolveI18nTemplate(
                "PQSdk.testAdapter.error.accessingSettingsPath",
                {
                    settingsPath: settingsFiles,
                    errorMessage
                }
            );
            outputChannel?.appendDebugLine(message);
        }
    } else if (Array.isArray(settingsFiles)) {
        for (const settingsFile of settingsFiles) {
            try {
                const fileStat: vscode.FileStat = await vscode.workspace.fs.stat(vscode.Uri.file(settingsFile));

                if (fileStat.type === vscode.FileType.Directory) {
                    void vscode.window.showErrorMessage(
                        resolveI18nTemplate("PQSdk.testAdapter.error.directoryNotSupportedInArray", {
                            settingsFile,
                            configPath: `${baseConfigPath}.${settingsFilesConfigKey}`,
                        }),
                    );
                } else {
                    if (settingsFile.endsWith(testSettingsFileEnding)) {
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
                }
                // Ignore files that don't exist
            } catch (e) {
                // Log errors as they might indicate real problems (permissions, network issues, etc.)
                const errorMessage = e instanceof Error ? e.message : String(e);
                const message = resolveI18nTemplate(
                    "PQSdk.testAdapter.error.accessingSettingsPath",
                    {
                        settingsPath: settingsFile,
                        errorMessage
                    }
                );
                outputChannel?.appendDebugLine(message);
            }
        }
    }

    return result;
}

/**
 * Reads the test path from a settings file and validates that it is either a directory or a .query.pq file.
 * The path is resolved relative to the workspace root if it's not an absolute path.
 * 
 * @param settingsFilePath Absolute path to the test settings file
 * @param fs File system operations (defaults to VS Code's workspace.fs)
 * @param workspace Workspace operations (defaults to VS Code's workspace)
 * @returns Promise that resolves to the resolved and validated test path
 */
export async function getTestPathFromSettings(
    settingsFilePath: string,
    fs: FileSystemOperations = defaultFileSystemOperations,
    workspace: WorkspaceOperations = defaultWorkspaceOperations,
): Promise<string> {
    let data: Uint8Array;
    try {
        data = await fs.readFile(vscode.Uri.file(settingsFilePath));
    } catch (err) {
        const message = resolveI18nTemplate(
            "PQSdk.testAdapter.error.failedToReadSettingsFile",
            { settingsFilePath }
        );
        throw new Error(message);
    }

    let json;
    try {
        const textData = new TextDecoder().decode(data);
        json = JSON.parse(textData);
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        const baseMessage = resolveI18nTemplate(
            "PQSdk.testAdapter.error.invalidJsonInSettingsFile",
            { settingsFilePath }
        );
        throw new Error(`${baseMessage}: ${errorMessage}`);
    }

    if (typeof json.QueryFilePath !== "string" || !json.QueryFilePath) {
        const message = resolveI18nTemplate(
            "PQSdk.testAdapter.error.queryFilePathNotFound",
            { settingsFilePath }
        );
        throw new Error(message);
    }

    const queryFilePathFromSettings = json.QueryFilePath;
    let resolvedQueryFilePath: string;

    if (path.isAbsolute(queryFilePathFromSettings)) {
        resolvedQueryFilePath = queryFilePathFromSettings;
    } else {
        // Resolve relative paths relative to the settings file directory
        const settingsFileDir = path.dirname(settingsFilePath);
        resolvedQueryFilePath = path.resolve(settingsFileDir, queryFilePathFromSettings);
    }

    const pathType = await getPathType(resolvedQueryFilePath, fs);

    switch (pathType) {
        case "directory":
            return resolvedQueryFilePath;
        case "file":
            if (resolvedQueryFilePath.endsWith(ExtensionConstants.TestAdapter.TestFileEnding)) {
                return resolvedQueryFilePath;
            } else {
                throw new Error(
                    resolveI18nTemplate("PQSdk.testAdapter.error.queryFilePathMustBeDirectoryOrPqFile", {
                        queryFilePath: queryFilePathFromSettings,
                        settingsFilePath,
                    }),
                );
            }
        case "not-found":
            throw new Error(
                resolveI18nTemplate("PQSdk.testAdapter.error.queryFilePathDoesNotExist", {
                    queryFilePath: queryFilePathFromSettings,
                    settingsFilePath,
                    resolvedPath: resolvedQueryFilePath,
                }),
            );
        default:
            // This case should not be reachable
            throw new Error(
                resolveI18nTemplate("PQSdk.testAdapter.error.unexpectedErrorCheckingPath", {
                    resolvedPath: resolvedQueryFilePath,
                }),
            );
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
        const textData = new TextDecoder().decode(data);
        const json = JSON.parse(textData);
        
        // Check if ExtensionPaths exists and is a non-empty array
        if (Array.isArray(json.ExtensionPaths) && json.ExtensionPaths.length > 0) {
            // Validate all elements are strings
            const allStrings = json.ExtensionPaths.every((item: any) => typeof item === 'string');
            if (allStrings) {
                return json.ExtensionPaths;
            }
        }
        
        return undefined;
    } catch (error) {
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
        const extensionPathsFromSettings = await getExtensionPathsFromSettings(settingsFilePath);
        
        if (extensionPathsFromSettings && extensionPathsFromSettings.length > 0) {
            const message = resolveI18nTemplate(
                "PQSdk.testAdapter.extensions.usingExtensionPathsFromSettingsFile",
                {
                    settingsFilePath,
                    extensionCount: extensionPathsFromSettings.length.toString(),
                }
            );
            outputChannel?.appendInfoLine(message);
            
            // Return undefined to signal: don't add --extension flags
            // pqtest.exe will use ExtensionPaths from the settings file
            return undefined;
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const message = resolveI18nTemplate(
            "PQSdk.testAdapter.extensions.failedToReadExtensionPathsFromSettings",
            { settingsFilePath, errorMessage }
        );
        outputChannel?.appendLine(message);
    }
    
    // Priority 2: Check powerquery.sdk.test.extensionPaths
    const testExtensionPaths = ExtensionConfigurations.TestExtensionPaths;
    
    if (testExtensionPaths !== undefined) {
        const count = Array.isArray(testExtensionPaths) 
            ? testExtensionPaths.length 
            : 1;
        
        // Skip empty arrays
        if (Array.isArray(testExtensionPaths) && testExtensionPaths.length === 0) {
            // Fall through to next priority
        } else {
            const message = resolveI18nTemplate(
                "PQSdk.testAdapter.extensions.usingTestExtensionPathsConfig",
                { extensionCount: count.toString() }
            );
            outputChannel?.appendInfoLine(message);
            return testExtensionPaths;
        }
    }
    
    // Priority 3: Fallback to powerquery.sdk.defaultExtension
    const defaultExtension = resolveSubstitutedValues(
        ExtensionConfigurations.DefaultExtensionLocation
    );
    
    if (defaultExtension) {
        const message = resolveI18nTemplate(
            "PQSdk.testAdapter.extensions.fallingBackToDefaultExtension",
            { extensionPath: defaultExtension }
        );
        outputChannel?.appendInfoLine(message);
        return defaultExtension;
    }
    
    // ERROR: No extensions configured anywhere
    throw new Error(extensionI18n["PQSdk.testAdapter.extensions.noExtensionsConfigured"]);
}

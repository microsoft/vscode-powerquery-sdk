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
import { resolveI18nTemplate } from "../../../i18n/extension";
import { PqSdkOutputChannel } from "../../../features/PqSdkOutputChannel";
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
        const workspaceFolder = workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error(
                resolveI18nTemplate("PQSdk.testAdapter.error.cannotResolveRelativePath", {
                    queryFilePath: queryFilePathFromSettings,
                }),
            );
        }
        resolvedQueryFilePath = path.resolve(workspaceFolder.uri.fsPath, queryFilePathFromSettings);
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

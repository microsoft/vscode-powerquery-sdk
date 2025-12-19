/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as path from "path";
import * as process from "process";
import * as vscode from "vscode";

// Regular expressions for variable substitution
const RegularSubstitutedValueRegexp: RegExp = /\${([A-Za-z0-9.]*)}/g;
const EnvironmentSubstitutedValueRegexp: RegExp = /\${env:(.*?)}/g;
const ConfigurationSubstitutedValueRegexp: RegExp = /\${config:(.*?)}/g;

enum SubstitutedValueMatchedStatus {
    REGULAR = 0xa01,
    ENV = 0xa02,
    CONFIG = 0xa03,
    NONE = 0xa04,
}

/**
 * Resolves VS Code variables like ${workspaceFolder} in a string.
 * Supports regular variables, environment variables, and configuration variables.
 * 
 * Examples:
 * - ${workspaceFolder} - Resolves to the workspace folder path
 * - ${env:HOME} - Resolves to the HOME environment variable
 * - ${config:editor.fontSize} - Resolves to the VS Code configuration value
 * 
 * @param str The string potentially containing variables to resolve
 * @returns The string with all variables resolved, or undefined if input was undefined
 */
export function resolveSubstitutedValues(str: string | undefined): string | undefined {
    if (str) {
        let result: string = str;
        let matchedType: SubstitutedValueMatchedStatus = SubstitutedValueMatchedStatus.NONE;
        let curMatch: RegExpExecArray | null = null;

        const tryToFindOneMatched = (): void => {
            matchedType = SubstitutedValueMatchedStatus.NONE;
            curMatch = RegularSubstitutedValueRegexp.exec(result);

            if (curMatch && matchedType === SubstitutedValueMatchedStatus.NONE) {
                matchedType = SubstitutedValueMatchedStatus.REGULAR;
            } else if (!curMatch) {
                curMatch = EnvironmentSubstitutedValueRegexp.exec(result);
            }

            if (curMatch && matchedType === SubstitutedValueMatchedStatus.NONE) {
                matchedType = SubstitutedValueMatchedStatus.ENV;
            } else if (!curMatch) {
                curMatch = ConfigurationSubstitutedValueRegexp.exec(result);
            }

            if (curMatch && matchedType === SubstitutedValueMatchedStatus.NONE) {
                matchedType = SubstitutedValueMatchedStatus.CONFIG;
            }
        };

        tryToFindOneMatched();

        while (curMatch && matchedType !== SubstitutedValueMatchedStatus.NONE) {
            const theMatch: RegExpExecArray = curMatch as RegExpExecArray;

            switch (matchedType) {
                case SubstitutedValueMatchedStatus.REGULAR:
                    result = replaceAt(
                        result,
                        theMatch.index,
                        theMatch[0].length,
                        doResolveRegularSubstitutedValue(theMatch[1]),
                    );
                    break;
                case SubstitutedValueMatchedStatus.ENV:
                    result = replaceAt(
                        result,
                        theMatch.index,
                        theMatch[0].length,
                        doResolveEnvironmentSubstitutedValue(theMatch[1]),
                    );
                    break;
                case SubstitutedValueMatchedStatus.CONFIG:
                    result = replaceAt(
                        result,
                        theMatch.index,
                        theMatch[0].length,
                        doResolveConfigurationSubstitutedValue(theMatch[1]),
                    );
                    break;
                default:
                    break;
            }

            tryToFindOneMatched();
        }

        return result;
    }

    return str;
}

/**
 * Resolves an array of strings, applying variable substitution to each element.
 * 
 * @param values Array of strings potentially containing variables
 * @returns Array with all variables resolved in each element
 */
export function resolveSubstitutedValuesInArray(values: string[] | undefined): string[] | undefined {
    if (!values) {
        return values;
    }

    return values.map((value) => resolveSubstitutedValues(value) ?? value);
}

// Helper functions for variable substitution

function doResolveRegularSubstitutedValue(valueName: string): string {
    const workspaces: Readonly<vscode.WorkspaceFolder[]> | undefined = vscode.workspace.workspaceFolders;

    const workspace: vscode.WorkspaceFolder | undefined = vscode.workspace.workspaceFolders?.length
        ? vscode.workspace.workspaceFolders[0]
        : undefined;

    const activeFile: vscode.TextDocument | undefined = vscode.window.activeTextEditor?.document;
    const absoluteActivateFilePath: string | undefined = activeFile?.uri.fsPath;

    let activeWorkspace: vscode.WorkspaceFolder | undefined = workspace;
    let relativeFilePath: string | undefined = absoluteActivateFilePath;

    if (Array.isArray(workspaces) && absoluteActivateFilePath) {
        for (const workspace of workspaces) {
            // absoluteActivateFilePath.indexOf(workspace.uri.fsPath) !== -1 or === 0 won't work
            if (absoluteActivateFilePath.replace(workspace.uri.fsPath, "") !== absoluteActivateFilePath) {
                activeWorkspace = workspace;

                relativeFilePath = absoluteActivateFilePath
                    .replace(workspace.uri.fsPath, "")
                    .substring(path.sep.length);

                break;
            }
        }
    }

    const parsedPath: path.ParsedPath | undefined = absoluteActivateFilePath
        ? path.parse(absoluteActivateFilePath)
        : undefined;

    let retVal: string | undefined = undefined;

    if (!retVal) {
        switch (valueName) {
            case "workspaceFolder":
                retVal = workspace?.uri.fsPath;
                break;
            case "workspaceFolderBasename":
                retVal = workspace?.name;
                break;
            case "file":
                retVal = absoluteActivateFilePath;
                break;
            case "fileWorkspaceFolder":
                retVal = activeWorkspace?.uri.fsPath;
                break;
            case "relativeFile":
                retVal = relativeFilePath;
                break;
            case "relativeFileDirname":
                retVal = relativeFilePath?.substring(0, relativeFilePath.lastIndexOf(path.sep));
                break;
            case "fileBasename":
                retVal = parsedPath?.base;
                break;
            case "fileBasenameNoExtension":
                retVal = parsedPath?.name;
                break;
            case "fileExtname":
                retVal = parsedPath?.ext;
                break;
            case "fileDirname":
                retVal = parsedPath?.dir.substring(parsedPath.dir.lastIndexOf(path.sep) + 1);
                break;
            case "cwd":
                retVal = parsedPath?.dir;
                break;
            case "pathSeparator":
                retVal = path.sep;
                break;
            case "lineNumber":
                retVal = vscode.window.activeTextEditor
                    ? String(vscode.window.activeTextEditor.selection.start.line + 1)
                    : undefined;
                break;
            case "selectedText":
                retVal = vscode.window.activeTextEditor
                    ? vscode.window.activeTextEditor.document.getText(
                          new vscode.Range(
                              vscode.window.activeTextEditor.selection.start,
                              vscode.window.activeTextEditor.selection.end,
                          ),
                      )
                    : undefined;
                break;
            default:
                retVal = valueName;
                break;
        }
    }

    return retVal ?? valueName;
}

function doResolveEnvironmentSubstitutedValue(valueName: string): string {
    return process.env[valueName] ?? "";
}

function doResolveConfigurationSubstitutedValue(valueName: string): string {
    return vscode.workspace.getConfiguration().get(valueName, "");
}

function replaceAt(str: string, index: number, length: number, replacement: string): string {
    return str.substring(0, index) + replacement + str.substring(index + length);
}

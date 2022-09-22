/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as fs from "fs";
import * as path from "path";
import * as process from "process";
import * as vscode from "vscode";

import { ExtensionConfigurations } from "../constants/PowerQuerySdkConfiguration";
import { ExtensionConstants } from "../constants/PowerQuerySdkExtension";
import { replaceAt } from "./strings";

const RegularSubstitutedValueRegexp: RegExp = /\${([A-Za-z0-9.]*)}/g;
const EnvironmentSubstitutedValueRegexp: RegExp = /\${env:(.*?)}/g;
const ConfigurationSubstitutedValueRegexp: RegExp = /\${config:(.*?)}/g;

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
                    ? String(vscode.window.activeTextEditor.selection.start.line) + 1
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

enum SubstitutedValueMatchedStatus {
    REGULAR = 0xa01,
    ENV = 0xa02,
    CONFIG = 0xa03,
    NONE = 0xa04,
}

// https://code.visualstudio.com/docs/editor/variables-reference
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

export function getFirstWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
    return vscode.workspace.workspaceFolders?.[0];
}

// require-await is not redundant over here
// eslint-disable-next-line require-await
export async function getAnyPqFileBeneathTheFirstWorkspace(): Promise<vscode.Uri[]> {
    const theFirstWorkspace: vscode.WorkspaceFolder | undefined = getFirstWorkspaceFolder();

    if (theFirstWorkspace) {
        return vscode.workspace.findFiles("*.{pq}", "**/bin/**", 10);
    }

    return [];
}

// require-await is not redundant over here
// eslint-disable-next-line require-await
export async function getAnyMProjFilesBeneathTheFirstWorkspace(): Promise<vscode.Uri[]> {
    const theFirstWorkspace: vscode.WorkspaceFolder | undefined = getFirstWorkspaceFolder();

    if (theFirstWorkspace) {
        return vscode.workspace.findFiles("*.{proj,mproj}", "**/bin/**", 1);
    }

    return [];
}

export function substitutedWorkspaceFolderBasenameIfNeeded(str: string): string {
    const firstWorksapce: vscode.WorkspaceFolder | undefined = getFirstWorkspaceFolder();

    if (firstWorksapce) {
        const workspaceFolderBaseName: string = firstWorksapce.name;
        const startingIndex: number = str.indexOf(workspaceFolderBaseName);

        if (startingIndex > -1) {
            str = replaceAt(str, startingIndex, workspaceFolderBaseName.length, "${workspaceFolderBasename}");
        }
    }

    return str;
}

export function manuallyGetLocalVscSetting(baseWorkspace: string): Record<string, string | undefined> {
    const expectedVscodeSettingPath: string | undefined = path.join(baseWorkspace, ".vscode", "settings.json");
    let result: Record<string, string> = {};

    if (fs.existsSync(expectedVscodeSettingPath)) {
        const content: string = fs.readFileSync(expectedVscodeSettingPath, { encoding: "utf8" });

        try {
            result = JSON.parse(content);
        } catch (e) {
            // noop
        }
    }

    return result;
}

export function getCurrentWorkspaceSettingPath(): string | undefined {
    const maybeFirstWorkspaceUri: vscode.Uri | undefined = getFirstWorkspaceFolder()?.uri;

    if (maybeFirstWorkspaceUri) {
        const expectedVscodeSettingPath: string | undefined = path.join(
            maybeFirstWorkspaceUri.fsPath,
            ".vscode",
            "settings.json",
        );

        if (expectedVscodeSettingPath && fs.existsSync(expectedVscodeSettingPath)) {
            return expectedVscodeSettingPath;
        }
    }

    return undefined;
}

// set the language service mode to sdk only if it were defined and also needed for the workspace
export function updateCurrentLocalPqModeIfNeeded(firstWorkspaceUriFsPath: string): void {
    // set the language service mode to sdk only if it were defined and also needed for the workspace
    const currentLocalVscSettingRecord: Record<string, string | undefined> =
        manuallyGetLocalVscSetting(firstWorkspaceUriFsPath);

    const currentLocalPqMode: string | undefined =
        currentLocalVscSettingRecord[
            `${ExtensionConstants.ConfigNames.PowerQuery}.${ExtensionConstants.ConfigNames.PowerQuery.properties.mode}`
        ];

    if (!currentLocalPqMode && ExtensionConfigurations.pqMode !== "SDK") {
        void ExtensionConfigurations.setPqMode("SDK", vscode.ConfigurationTarget.Workspace);
    }
}

export async function maybeHandleNewWorkspaceCreated(): Promise<void> {
    const maybeFirstWorkspaceUri: vscode.Uri | undefined = getFirstWorkspaceFolder()?.uri;

    if (maybeFirstWorkspaceUri) {
        const baseDirectory: string = path.basename(maybeFirstWorkspaceUri.fsPath);
        const expectedRootPqPath: string = path.join(maybeFirstWorkspaceUri.fsPath, `${baseDirectory}.pq`);

        if (fs.existsSync(expectedRootPqPath)) {
            const expectedRootPqPathStat: fs.Stats = fs.statSync(expectedRootPqPath);

            // a new workspace just got created
            if (Math.abs(expectedRootPqPathStat.ctime.getTime() - Date.now()) < 6e4) {
                // open the expected root-level pq connector file
                void vscode.commands.executeCommand("vscode.open", vscode.Uri.file(expectedRootPqPath));

                updateCurrentLocalPqModeIfNeeded(maybeFirstWorkspaceUri.fsPath);

                // build when freshly created, just execute the command
                // to trigger the ExecuteBuildTaskAndAwaitIfNeeded from pqTestService
                await vscode.commands.executeCommand("powerquery.sdk.tools.BuildProjectCommand");
                // and also set up the workspace as the output of the msbuild might be different
                await vscode.commands.executeCommand("powerquery.sdk.tools.SetupCurrentWorkspaceCommand");
                // and seize its info for the very first time
                await vscode.commands.executeCommand("powerquery.sdk.tools.DisplayExtensionInfoCommand");
            }
        }
    }
}

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as vscode from "vscode";
import { replaceAt } from "./strings";
import { Uri } from "vscode";

const SubstitutedValueRegexp: RegExp = /\${([A-Za-z0-9.]*)}/g;

function doResolveSubstitutedValue(valueName: string): string {
    let retVal: string | undefined = vscode.workspace.getConfiguration().get(valueName);

    if (!retVal) {
        switch (valueName) {
            case "workspaceFolder":
                retVal = getFirstWorkspaceFolder()?.uri.fsPath;
                break;
            default:
                retVal = valueName;
                break;
        }
    }

    return retVal ?? "";
}

// todo, need to think about it....these substituted values could be very annoying...should we support em
// https://code.visualstudio.com/docs/editor/variables-reference
export function resolveSubstitutedValues(str: string | undefined): string | undefined {
    if (str) {
        let result: string = str;
        let curMatch: RegExpExecArray | null = SubstitutedValueRegexp.exec(result ?? "");

        while (curMatch && result) {
            result = replaceAt(result, curMatch.index, curMatch[0].length, doResolveSubstitutedValue(curMatch[1]));
            curMatch = SubstitutedValueRegexp.exec(result ?? "");
        }

        return result;
    }

    return str;
}

export function getFirstWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
    return vscode.workspace.workspaceFolders?.[0];
}

// require-await is redundant over here
// eslint-disable-next-line require-await
export async function getAnyPqMProjFileBeneathTheFirstWorkspace(): Promise<Uri[]> {
    const theFirstWorkspace: vscode.WorkspaceFolder | undefined = getFirstWorkspaceFolder();

    if (theFirstWorkspace) {
        return vscode.workspace.findFiles("*.{pq,mproj}", null, 10);
    }

    return [];
}

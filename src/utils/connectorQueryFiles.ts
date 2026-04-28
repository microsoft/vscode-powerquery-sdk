/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as vscode from "vscode";

export const connectorQueryFileGlob: string = "**/*.{query,test,parameterquery}.pq";
export const connectorQueryFileExcludeGlob: string = "**/{bin,obj}/**";

// Comparator that sorts `.parameterquery.pq` files before other query files,
// with alphabetical ordering within each group.
export function parameterQueryFirstCompare(a: vscode.Uri, b: vscode.Uri): number {
    const aIsPQ: boolean = a.fsPath.endsWith(".parameterquery.pq");
    const bIsPQ: boolean = b.fsPath.endsWith(".parameterquery.pq");

    if (aIsPQ && !bIsPQ) return -1;

    if (!aIsPQ && bIsPQ) return 1;

    return a.fsPath.localeCompare(b.fsPath);
}

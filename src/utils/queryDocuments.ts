/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as path from "path";
import * as vscode from "vscode";

import { extensionI18n, resolveI18nTemplate } from "../i18n/extension";

export async function ensureQueryDocumentSaved(
    queryFile: string | vscode.Uri | undefined,
    workingDirectory: string = process.cwd(),
): Promise<void> {
    if (!queryFile) {
        return;
    }

    const queryPath: string = typeof queryFile === "string" ? queryFile : queryFile.fsPath;

    if (typeof queryFile !== "string" && queryFile.scheme !== "file") {
        throw new Error(resolveI18nTemplate("PQSdk.query.saveToFile", { queryFile: queryPath }));
    }

    const normalizePath = (value: string): string =>
        process.platform === "win32" ? path.resolve(value).toLowerCase() : path.resolve(value);

    const resolvedQueryFile: string = normalizePath(path.resolve(workingDirectory, queryPath));

    const document: vscode.TextDocument | undefined = vscode.workspace.textDocuments.find(
        (candidate: vscode.TextDocument) => normalizePath(candidate.uri.fsPath) === resolvedQueryFile,
    );

    if (!document) {
        return;
    }

    if (document.isUntitled || document.uri.scheme !== "file") {
        throw new Error(resolveI18nTemplate("PQSdk.query.saveToFile", { queryFile: queryPath }));
    }

    if (!document.isDirty) {
        return;
    }

    const saveAction: string = extensionI18n["PQSdk.query.saveAndRun"];

    const action: string | undefined = await vscode.window.showWarningMessage(
        resolveI18nTemplate("PQSdk.query.saveRequired", { queryFile: queryPath }),
        saveAction,
        extensionI18n["PQSdk.common.cancel"],
    );

    if (action !== saveAction) {
        throw new Error(resolveI18nTemplate("PQSdk.query.executionCancelled", { queryFile: queryPath }));
    }

    if (!(await document.save()) || document.isDirty) {
        throw new Error(resolveI18nTemplate("PQSdk.query.saveFailed", { queryFile: queryPath }));
    }
}

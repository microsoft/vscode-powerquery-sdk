/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as path from "path";
import * as vscode from "vscode";

import { extensionI18n, resolveI18nTemplate } from "../i18n/extension";

let pendingSave: Promise<void> | undefined;

function dirtyFileDocuments(): vscode.TextDocument[] {
    return vscode.workspace.textDocuments.filter(
        (document: vscode.TextDocument) => document.uri.scheme === "file" && document.isDirty,
    );
}

async function saveFileDocuments(): Promise<void> {
    if (dirtyFileDocuments().length === 0) {
        return;
    }

    const saveAction: string = extensionI18n["PQSdk.query.saveAndRun"];

    const action: string | undefined = await vscode.window.showWarningMessage(
        extensionI18n["PQSdk.query.saveRequired"],
        saveAction,
        extensionI18n["PQSdk.common.cancel"],
    );

    if (action !== saveAction) {
        throw new Error(extensionI18n["PQSdk.query.executionCancelled"]);
    }

    while (dirtyFileDocuments().length > 0) {
        for (const document of dirtyFileDocuments()) {
            if (!document.isDirty) {
                continue;
            }

            // eslint-disable-next-line no-await-in-loop
            if (!(await document.save()) || document.isDirty) {
                throw new Error(resolveI18nTemplate("PQSdk.query.saveFailed", { queryFile: document.uri.fsPath }));
            }
        }
    }
}

export function ensureFileBackedDocumentsSaved(): Promise<void> {
    if (!pendingSave) {
        pendingSave = saveFileDocuments().finally(() => {
            pendingSave = undefined;
        });
    }

    return pendingSave;
}

export async function prepareWithSavedDocuments<T>(prepare: () => Promise<T>): Promise<T> {
    let changed: boolean;
    let result: T;

    do {
        // eslint-disable-next-line no-await-in-loop
        await ensureFileBackedDocumentsSaved();
        changed = false;

        const markChanged = (document: vscode.TextDocument): void => {
            if (document.uri.scheme === "file") {
                changed = true;
            }
        };

        const changes: vscode.Disposable = vscode.workspace.onDidChangeTextDocument(
            (event: vscode.TextDocumentChangeEvent) => markChanged(event.document),
        );

        const saves: vscode.Disposable = vscode.workspace.onDidSaveTextDocument(markChanged);

        try {
            // eslint-disable-next-line no-await-in-loop
            result = await prepare();
            // eslint-disable-next-line no-await-in-loop
            await ensureFileBackedDocumentsSaved();
        } finally {
            changes.dispose();
            saves.dispose();
        }
    } while (changed);

    return result;
}

export async function ensureQueryDocumentSaved(
    queryFile: string | vscode.Uri | undefined,
    workingDirectory: string = process.cwd(),
): Promise<void> {
    const queryPath: string = typeof queryFile === "string" ? queryFile : (queryFile?.fsPath ?? "");

    if (queryFile && typeof queryFile !== "string" && queryFile.scheme !== "file") {
        throw new Error(resolveI18nTemplate("PQSdk.query.saveToFile", { queryFile: queryPath }));
    }

    const normalizePath = (value: string): string =>
        process.platform === "win32" ? path.resolve(value).toLowerCase() : path.resolve(value);

    const resolvedQueryFile: string | undefined = queryPath
        ? normalizePath(path.resolve(workingDirectory, queryPath))
        : undefined;

    const document: vscode.TextDocument | undefined = vscode.workspace.textDocuments.find(
        (candidate: vscode.TextDocument) =>
            (candidate.uri.scheme === "file" || candidate.isUntitled) &&
            normalizePath(candidate.uri.fsPath) === resolvedQueryFile,
    );

    if (document && (document.isUntitled || document.uri.scheme !== "file")) {
        throw new Error(resolveI18nTemplate("PQSdk.query.saveToFile", { queryFile: queryPath }));
    }

    await ensureFileBackedDocumentsSaved();
}

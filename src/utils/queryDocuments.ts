/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { parse, ParseError } from "jsonc-parser";
import * as path from "path";
import { isDeepStrictEqual } from "util";
import * as vscode from "vscode";

import { ExtensionConstants } from "../constants/PowerQuerySdkExtension";
import { extensionI18n, resolveI18nTemplate } from "../i18n/extension";

let pendingSave: Promise<void> | undefined;

function isSettingsObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function ensureSavedSdkConfigurationApplied(document: vscode.TextDocument): Promise<void> {
    const workspaceFile: vscode.Uri | undefined = vscode.workspace.workspaceFile;

    const isWorkspaceFile: boolean =
        workspaceFile?.scheme === "file" && path.relative(workspaceFile.fsPath, document.uri.fsPath) === "";

    const folder: vscode.WorkspaceFolder | undefined = vscode.workspace.workspaceFolders?.find(
        (candidate: vscode.WorkspaceFolder) =>
            path.relative(path.join(candidate.uri.fsPath, ".vscode", "settings.json"), document.uri.fsPath) === "",
    );

    if (!isWorkspaceFile && !folder) {
        return;
    }

    const configurationError = (): Error =>
        new Error(resolveI18nTemplate("PQSdk.query.configurationNotApplied", { queryFile: document.uri.fsPath }));

    const errors: ParseError[] = [];
    const parsed: unknown = parse(document.getText(), errors, { allowTrailingComma: true, allowEmptyContent: true });

    if (errors.length > 0 || (parsed !== undefined && !isSettingsObject(parsed))) {
        throw configurationError();
    }

    const settings: unknown = isWorkspaceFile && isSettingsObject(parsed) ? (parsed.settings ?? {}) : (parsed ?? {});

    if (!isSettingsObject(settings)) {
        throw configurationError();
    }

    const namespace: string = ExtensionConstants.ConfigNames.PowerQuerySdk.name;

    const expected: Map<string, unknown> = new Map(
        Object.entries(settings)
            .filter(([key]: [string, unknown]) => key.startsWith(`${namespace}.`))
            .map(([key, value]: [string, unknown]) => [key.slice(namespace.length + 1), value]),
    );

    const configurationApplied = (): boolean => {
        const configuration: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(undefined, folder?.uri);

        const values: Record<string, unknown> | undefined =
            configuration.inspect<Record<string, unknown>>(namespace)?.[
                folder && workspaceFile ? "workspaceFolderValue" : "workspaceValue"
            ];

        const remaining: Map<string, unknown> = new Map(expected);

        const matches = (node: Record<string, unknown>, prefix: string = ""): boolean =>
            Object.entries(node).every(([key, value]: [string, unknown]) => {
                const section: string = `${prefix}${key}`;

                if (remaining.has(section)) {
                    const expectedValue: unknown = remaining.get(section);
                    remaining.delete(section);

                    return isDeepStrictEqual(value, expectedValue);
                }

                return isSettingsObject(value) && matches(value, `${section}.`);
            });

        return matches(values ?? {}) && remaining.size === 0;
    };

    if (configurationApplied()) {
        return;
    }

    // Saving settings completes before VS Code's asynchronous configuration reload.
    await new Promise<void>((resolve: () => void, reject: (error: Error) => void) => {
        const changes: vscode.Disposable = vscode.workspace.onDidChangeConfiguration(() => {
            if (configurationApplied()) {
                clearTimeout(timeout);
                changes.dispose();
                resolve();
            }
        });

        const timeout: NodeJS.Timeout = setTimeout(() => {
            changes.dispose();
            reject(configurationError());
        }, 10_000);
    });
}

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

            // eslint-disable-next-line no-await-in-loop
            await ensureSavedSdkConfigurationApplied(document);
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

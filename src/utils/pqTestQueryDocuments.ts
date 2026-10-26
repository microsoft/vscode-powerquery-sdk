/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as path from "path";
import { TextDecoder } from "util";
import * as vscode from "vscode";

import { ensureQueryDocumentsSaved } from "./queryDocuments";

export function hasQueryFileArguments(args: readonly string[]): boolean {
    return args.some(
        (arg: string) =>
            arg === "--queryFile" ||
            arg.startsWith("--queryFile=") ||
            arg === "--settingsFile" ||
            arg.startsWith("--settingsFile="),
    );
}

export async function ensurePqTestQueryDocumentsSaved(
    args: readonly string[],
    workingDirectory: string,
    knownQueryFiles: readonly vscode.Uri[] = [],
): Promise<void> {
    const queries: string[] = [];
    const settingsFiles: string[] = [];

    for (let index: number = 0; index < args.length; index++) {
        const argument: string = args[index];
        const separator: number = argument.indexOf("=");
        const name: string = separator < 0 ? argument : argument.slice(0, separator);

        if (name !== "--queryFile" && name !== "--settingsFile") {
            continue;
        }

        const value: string | undefined = separator < 0 ? args[++index] : argument.slice(separator + 1);

        if (!value || value.startsWith("--")) {
            continue;
        }

        (name === "--queryFile" ? queries : settingsFiles).push(path.resolve(workingDirectory, value));
    }

    for (const settingsFile of settingsFiles) {
        // eslint-disable-next-line no-await-in-loop
        const data: Uint8Array = await vscode.workspace.fs.readFile(vscode.Uri.file(settingsFile));
        const settings: unknown = JSON.parse(new TextDecoder().decode(data));

        if (settings !== null && typeof settings === "object") {
            for (const name of ["QueryFilePath", "ParameterQueryFilePath"] as const) {
                const value: unknown = (settings as { QueryFilePath?: unknown; ParameterQueryFilePath?: unknown })[
                    name
                ];

                if (typeof value === "string" && value.length > 0) {
                    queries.push(path.resolve(path.dirname(settingsFile), value));
                }
            }
        }
    }

    const matchesQueryDirectory = (document: vscode.TextDocument): boolean =>
        document.uri.scheme === "file" &&
        document.uri.fsPath.toLowerCase().endsWith(".query.pq") &&
        queries.some((query: string) => {
            const relative: string = path.relative(query, document.uri.fsPath);

            return relative.length > 0 && !path.isAbsolute(relative) && relative.split(path.sep)[0] !== "..";
        });

    do {
        const queryFiles: vscode.Uri[] = [
            ...knownQueryFiles,
            ...queries.map((query: string) => vscode.Uri.file(query)),
        ];

        // QueryFilePath can name a test directory rather than an individual query.
        queryFiles.push(
            ...vscode.workspace.textDocuments
                .filter(matchesQueryDirectory)
                .map((document: vscode.TextDocument) => document.uri),
        );

        // eslint-disable-next-line no-await-in-loop
        await ensureQueryDocumentsSaved(queryFiles);
    } while (
        vscode.workspace.textDocuments.some(
            (document: vscode.TextDocument) => document.isDirty && matchesQueryDirectory(document),
        )
    );
}

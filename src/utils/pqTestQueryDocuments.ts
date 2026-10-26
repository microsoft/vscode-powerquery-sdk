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

function matchesFilterSegment(value: string, pattern: string): boolean {
    let previous: boolean[] = new Array<boolean>(value.length + 1).fill(false);
    previous[0] = true;

    for (const character of pattern) {
        const current: boolean[] = new Array<boolean>(value.length + 1).fill(false);
        current[0] = character === "*" && previous[0];

        for (let index: number = 1; index <= value.length; index++) {
            current[index] =
                character === "*"
                    ? previous[index] || current[index - 1]
                    : previous[index - 1] && value[index - 1] === character;
        }

        previous = current;
    }

    return previous[value.length];
}

function matchesTestFilters(relativePath: string, filters: readonly string[]): boolean {
    const includes: string[] = filters.filter((filter: string) => !filter.startsWith("!"));

    const excludes: string[] = filters
        .filter((filter: string) => filter.startsWith("!"))
        .map((filter: string) => filter.slice(1));

    const matches = (pattern: string): boolean => {
        const segments: string[] = pattern.toLowerCase().replace(/\\/g, "/").replace(/^\.\//, "").split("/");
        const parts: string[] = relativePath.toLowerCase().replace(/\\/g, "/").split("/");
        let previous: boolean[] = new Array<boolean>(parts.length + 1).fill(false);
        previous[0] = true;

        for (const segment of segments) {
            const current: boolean[] = new Array<boolean>(parts.length + 1).fill(false);
            current[0] = segment === "**" && previous[0];

            for (let index: number = 1; index <= parts.length; index++) {
                if (segment === "**") {
                    current[index] = previous[index] || current[index - 1];
                } else {
                    current[index] = previous[index - 1] && matchesFilterSegment(parts[index - 1], segment);
                }
            }

            previous = current;
        }

        return previous[parts.length];
    };

    // PQTest combines includes as a union; exclusions always win, regardless of order.
    return (includes.length === 0 ? matches("**/*.query.pq") : includes.some(matches)) && !excludes.some(matches);
}

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
    const parameterQueries: string[] = [];
    const settingsFiles: string[] = [];
    const filters: string[] = [];

    for (let index: number = 0; index < args.length; index++) {
        const argument: string = args[index];
        const separator: number = argument.indexOf("=");
        const name: string = separator < 0 ? argument : argument.slice(0, separator);

        if (name !== "--queryFile" && name !== "--settingsFile" && name !== "--testFilter") {
            continue;
        }

        const value: string | undefined = separator < 0 ? args[++index] : argument.slice(separator + 1);

        if (!value || value.startsWith("--")) {
            continue;
        }

        if (name === "--testFilter") {
            filters.push(value);
        } else {
            (name === "--queryFile" ? queries : settingsFiles).push(path.resolve(workingDirectory, value));
        }
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
                    (name === "ParameterQueryFilePath" ? parameterQueries : queries).push(
                        path.resolve(path.dirname(settingsFile), value),
                    );
                }
            }

            const settingsFilters: unknown = (settings as { TestFilters?: unknown }).TestFilters;

            if (Array.isArray(settingsFilters)) {
                filters.push(
                    ...settingsFilters.filter((filter: unknown): filter is string => typeof filter === "string"),
                );
            }
        }
    }

    const matchesQuery = (filePath: string): boolean =>
        queries.some((query: string) => {
            const relative: string = path.relative(query, filePath);

            if (relative.length === 0) {
                return filters.length === 0 || matchesTestFilters(path.basename(filePath), filters);
            }

            return (
                !path.isAbsolute(relative) &&
                relative.split(path.sep)[0] !== ".." &&
                matchesTestFilters(relative, filters)
            );
        });

    const matchesOpenQuery = (document: vscode.TextDocument): boolean =>
        document.uri.scheme === "file" && matchesQuery(document.uri.fsPath);

    do {
        const queryFiles: vscode.Uri[] = [
            ...knownQueryFiles.filter(
                (queryFile: vscode.Uri) =>
                    queryFile.scheme !== "file" || queries.length === 0 || matchesQuery(queryFile.fsPath),
            ),
            ...queries.filter(matchesQuery).map((query: string) => vscode.Uri.file(query)),
            ...parameterQueries.map((query: string) => vscode.Uri.file(query)),
        ];

        // QueryFilePath can name a test directory rather than an individual query.
        queryFiles.push(
            ...vscode.workspace.textDocuments
                .filter(matchesOpenQuery)
                .map((document: vscode.TextDocument) => document.uri),
        );

        // eslint-disable-next-line no-await-in-loop
        await ensureQueryDocumentsSaved(queryFiles);
    } while (
        vscode.workspace.textDocuments.some(
            (document: vscode.TextDocument) => document.isDirty && matchesOpenQuery(document),
        )
    );
}

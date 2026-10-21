/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { minimatch } from "minimatch";
import * as path from "path";
import * as vscode from "vscode";

type Excludes = Record<string, boolean | { when: string }>;

function getExcludes(uri: vscode.Uri): Excludes {
    return {
        ...vscode.workspace.getConfiguration("files", uri).get<Excludes>("exclude", {}),
        ...vscode.workspace.getConfiguration("search", uri).get<Excludes>("exclude", {}),
    };
}

/**
 * Anchor exclusions to the workspace, not the configured search directory.
 * Include descendants so excluded directory names also prune recursive searches.
 */
export function getTestSettingsExcludePattern(uri: vscode.Uri): vscode.RelativePattern | null {
    const root: vscode.Uri = vscode.workspace.getWorkspaceFolder(uri)?.uri ?? uri;

    const patterns: string[] = Object.entries(getExcludes(uri))
        .filter(([, value]: [string, boolean | { when: string }]) => value === true)
        .flatMap(([pattern]: [string, boolean | { when: string }]) => [pattern, `${pattern}/**`]);

    return patterns.length > 0 ? new vscode.RelativePattern(root, `{${patterns.join(",")}}`) : null;
}

/**
 * Watchers do not honor search exclusions. Check events locally without rediscovery.
 * Conditional sibling exclusions cannot prune a search, so check those here too.
 */
export async function isTestSettingsExcluded(uri: vscode.Uri): Promise<boolean> {
    const root: vscode.Uri | undefined = vscode.workspace.getWorkspaceFolder(uri)?.uri;

    if (!root) {
        return false;
    }

    const relativePath: string = path.relative(root.fsPath, uri.fsPath).split(path.sep).join("/");
    const candidates: string[] = [];
    let candidate: string = relativePath;

    while (candidate && candidate !== ".") {
        candidates.push(candidate);
        candidate = path.posix.dirname(candidate);
    }

    for (const [pattern, value] of Object.entries(getExcludes(uri))) {
        if (!value) {
            continue;
        }

        for (const relativeCandidate of candidates) {
            if (
                !minimatch(relativeCandidate, pattern, {
                    dot: true,
                    nonegate: true,
                    noext: true,
                    nocase: process.platform === "win32",
                })
            ) {
                continue;
            }

            if (value === true) {
                return true;
            }

            const basename: string = path.posix.parse(relativeCandidate).name;

            const sibling: vscode.Uri = vscode.Uri.joinPath(
                root,
                path.posix.dirname(relativeCandidate),
                value.when.replace(/\$\(basename\)/g, basename),
            );

            try {
                // eslint-disable-next-line no-await-in-loop -- Conditional exclusions require sibling checks
                await vscode.workspace.fs.stat(sibling);

                return true;
            } catch (error) {
                if (!(error instanceof vscode.FileSystemError) || error.code !== "FileNotFound") {
                    throw error;
                }
            }
        }
    }

    return false;
}

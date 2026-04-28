/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as assert from "assert";
import * as path from "path";
import * as vscode from "vscode";

import {
    connectorQueryFileExcludeGlob,
    connectorQueryFileGlob,
    parameterQueryFirstCompare,
} from "../../utils/connectorQueryFiles";
import { ensureRequiredExtensionsAreLoaded } from "../TestUtils";

suite("Query File Picker Integration Tests", () => {
    suiteSetup(ensureRequiredExtensionsAreLoaded);

    test("should discover .parameterquery.pq files alongside .query.pq and .test.pq", async () => {
        const files: vscode.Uri[] = await vscode.workspace.findFiles(
            connectorQueryFileGlob,
            connectorQueryFileExcludeGlob,
            1e2,
        );

        const filenames: string[] = files.map((uri: vscode.Uri) => path.basename(uri.fsPath));

        assert.ok(
            filenames.some((name: string) => name.endsWith(".query.pq")),
            "Should find .query.pq files",
        );

        assert.ok(
            filenames.some((name: string) => name.endsWith(".test.pq")),
            "Should find .test.pq files",
        );

        assert.ok(
            filenames.some((name: string) => name.endsWith(".parameterquery.pq")),
            "Should find .parameterquery.pq files",
        );
    });

    test("should sort parameterquery files before other query files", async () => {
        const files: vscode.Uri[] = await vscode.workspace.findFiles(
            connectorQueryFileGlob,
            connectorQueryFileExcludeGlob,
            1e2,
        );

        files.sort(parameterQueryFirstCompare);

        const lastParameterQueryIndex: number = files
            .map((f: vscode.Uri) => f.fsPath.endsWith(".parameterquery.pq"))
            .lastIndexOf(true);

        const firstNonParameterQueryIndex: number = files.findIndex(
            (f: vscode.Uri) => !f.fsPath.endsWith(".parameterquery.pq"),
        );

        if (lastParameterQueryIndex !== -1 && firstNonParameterQueryIndex !== -1) {
            assert.ok(
                lastParameterQueryIndex < firstNonParameterQueryIndex,
                `All .parameterquery.pq files should appear before other query files. ` +
                    `Last parameterquery at index ${lastParameterQueryIndex}, first other at index ${firstNonParameterQueryIndex}`,
            );
        }
    });

    test("should maintain alphabetical order within each group", async () => {
        const files: vscode.Uri[] = await vscode.workspace.findFiles(
            connectorQueryFileGlob,
            connectorQueryFileExcludeGlob,
            1e2,
        );

        files.sort(parameterQueryFirstCompare);

        const parameterQueryFiles: string[] = files
            .filter((f: vscode.Uri) => f.fsPath.endsWith(".parameterquery.pq"))
            .map((f: vscode.Uri) => f.fsPath);

        const otherFiles: string[] = files
            .filter((f: vscode.Uri) => !f.fsPath.endsWith(".parameterquery.pq"))
            .map((f: vscode.Uri) => f.fsPath);

        for (let i: number = 1; i < parameterQueryFiles.length; i++) {
            assert.ok(
                parameterQueryFiles[i - 1].localeCompare(parameterQueryFiles[i]) <= 0,
                `Parameterquery files should be alphabetical: ${parameterQueryFiles[i - 1]} should come before ${parameterQueryFiles[i]}`,
            );
        }

        for (let i: number = 1; i < otherFiles.length; i++) {
            assert.ok(
                otherFiles[i - 1].localeCompare(otherFiles[i]) <= 0,
                `Other query files should be alphabetical: ${otherFiles[i - 1]} should come before ${otherFiles[i]}`,
            );
        }
    });
});

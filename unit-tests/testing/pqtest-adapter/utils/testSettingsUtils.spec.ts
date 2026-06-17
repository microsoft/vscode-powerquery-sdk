/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { describe, it } from "mocha";
import { expect } from "chai";
import * as vscode from "vscode";

import { resolveTestSettingsFileUris } from "../../../../src/testing/pqtest-adapter/utils/testSettingsUtils";
import {
    FileSystemOperations,
    WorkspaceOperations,
} from "../../../../src/testing/pqtest-adapter/utils/vscodeFs";

describe("testSettingsUtils", () => {
    it("should return explicit settings files without searching the workspace", async () => {
        let findFilesCallCount: number = 0;
        const settingsFilePath: string = "/workspace/tests/sample.testsettings.json";
        const fs: FileSystemOperations = {
            readFile: async () => new Uint8Array(),
            stat: async () => ({ type: vscode.FileType.File, ctime: 0, mtime: 0, size: 0 }),
        };
        const workspace: WorkspaceOperations = {
            workspaceFolders: undefined,
            findFiles: async () => {
                findFilesCallCount += 1;
                return [];
            },
        };

        const result: vscode.Uri[] = await resolveTestSettingsFileUris([settingsFilePath], fs, workspace);

        expect(findFilesCallCount).to.equal(0);
        expect(result.map((uri: vscode.Uri) => uri.fsPath)).to.deep.equal([settingsFilePath]);
    });

    it("should search configured directories using a non-recursive file pattern", async () => {
        const settingsDirectoryPath: string = "/workspace/tests";
        const discoveredUris: vscode.Uri[] = [vscode.Uri.file("/workspace/tests/child.testsettings.json")];
        const fs: FileSystemOperations = {
            readFile: async () => new Uint8Array(),
            stat: async () => ({ type: vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 }),
        };
        let receivedPattern: string | undefined;
        let receivedBaseUri: string | undefined;
        const workspace: WorkspaceOperations = {
            workspaceFolders: undefined,
            findFiles: async (include: vscode.GlobPattern) => {
                expect(include).to.be.instanceOf(vscode.RelativePattern);

                const pattern: vscode.RelativePattern = include as vscode.RelativePattern;
                receivedPattern = pattern.pattern;
                receivedBaseUri = pattern.baseUri.fsPath;

                return discoveredUris;
            },
        };

        const result: vscode.Uri[] = await resolveTestSettingsFileUris(settingsDirectoryPath, fs, workspace);

        expect(receivedBaseUri).to.equal(settingsDirectoryPath);
        expect(receivedPattern).to.equal("*.testsettings.json");
        expect(result).to.deep.equal(discoveredUris);
    });
});

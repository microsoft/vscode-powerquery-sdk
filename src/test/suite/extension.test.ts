/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as assert from "assert";
import * as vscode from "vscode";

import { extensionLanguageServiceId } from "../common";
import * as TestUtils from "../TestUtils";

const languageServiceId: string = extensionLanguageServiceId;

suite("Extension Test Suite", () => {
    suiteSetup(TestUtils.ensureRequiredExtensionsAreLoaded);

    suiteTeardown(() => {
        // Global cleanup
    });

    test("should load the language service extension", () => {
        const languageServiceExtension = vscode.extensions.getExtension(languageServiceId);

        assert.ok(languageServiceExtension, `Extension not found: ${languageServiceId}`);
        assert.ok(languageServiceExtension.isActive, "Language service extension failed to activate");
    });

    test("should load the SDK extension", () => {
        const sdkExtension = vscode.extensions.getExtension("PowerQuery.vscode-powerquery-sdk");

        assert.ok(sdkExtension, "SDK extension not found");
        assert.ok(sdkExtension.isActive, "SDK extension failed to activate");
    });

    test("should register expected commands", async () => {
        const commands = await vscode.commands.getCommands(true);

        const expectedCommands = [
            "powerquery.sdk.tools.CreateNewProjectCommand",
            "powerquery.sdk.tools.SeizePqTestCommand",
        ];

        for (const expectedCommand of expectedCommands) {
            assert.ok(commands.includes(expectedCommand), `Command '${expectedCommand}' should be registered`);
        }
    });

    // TODO: Add onModuleLibraryUpdated test when language service extension returns a result that can be validated.
});

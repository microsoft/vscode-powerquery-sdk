/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as assert from "assert";
import * as vscode from "vscode";

import * as TestUtils from "../TestUtils";

import { extensionLanguageServiceId } from "../common";

const languageServiceId: string = extensionLanguageServiceId;

suite("Extension Test Suite", () => {
    suiteSetup(TestUtils.activateExtension);

    test("Language service extension", async () => {
        const languageServiceExtension =
            vscode.extensions.getExtension(languageServiceId) ||
            assert.fail(`Failed to get language service extension: ${languageServiceId}`);

        if (!languageServiceExtension.isActive) {
            await languageServiceExtension.activate();
        }

        await TestUtils.CreateAsyncTestResult(() => {
            assert.equal(languageServiceExtension.isActive, true, "Language service extension failed to activate");
        });
    });

    // TODO: Add onModuleLibraryUpdated test when language service extension returns a result that can be validated.
});

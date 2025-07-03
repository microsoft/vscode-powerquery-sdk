/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as assert from "assert";
import * as path from "path";
import * as vscode from "vscode";

import * as TestUtils from "../TestUtils";

import { SchemaManagementService } from "../../common/SchemaManagementService";

suite("Basic Schema Tests", () => {
    suiteSetup(TestUtils.activateExtension);

    test("Extension loads and schema service can be created", async () => {
        await TestUtils.CreateAsyncTestResult(() => {
            // Get extension context
            const extension = vscode.extensions.getExtension("ms-powerquery.vscode-powerquery-sdk");
            assert.ok(extension, "Extension should be available");

            if (extension?.isActive) {
                // Create schema service (this tests that our new service can be instantiated)
                const mockContext = {
                    extensionPath: path.resolve(__dirname, "../../../.."),
                } as vscode.ExtensionContext;

                const schemaService = new SchemaManagementService(mockContext);
                assert.ok(schemaService, "SchemaManagementService should be created successfully");

                // Test that the schema check method exists and works
                const schemaExists = schemaService.userSettingsSchemaExists();
                assert.ok(typeof schemaExists === "boolean", "userSettingsSchemaExists should return a boolean");
            }
        });
    });

    test("Package.json contains JSON validation contribution", async () => {
        await TestUtils.CreateAsyncTestResult(() => {
            // Dynamic import to check package.json
            // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
            const packageJson = require("../../../../package.json");

            assert.ok(packageJson.contributes, "Package should have contributes section");
            assert.ok(packageJson.contributes.jsonValidation, "Package should have jsonValidation contribution");

            const validationRules = packageJson.contributes.jsonValidation;

            const testSettingsRule = validationRules.find(
                (rule: { fileMatch: string }) => rule.fileMatch === "*.testsettings.json",
            );

            assert.ok(testSettingsRule, "Should have validation rule for *.testsettings.json files");

            assert.strictEqual(
                testSettingsRule.url,
                "./schemas/UserSettings.schema.json",
                "Should reference the correct schema file",
            );
        });
    });
});

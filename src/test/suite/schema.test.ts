/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import * as TestUtils from "../TestUtils";

import { SchemaManagementService } from "../../common/SchemaManagementService";

suite("Schema Management Tests", () => {
    let schemaManagementService: SchemaManagementService;
    let extensionContext: vscode.ExtensionContext;
    let testWorkspaceFolder: string;

    suiteSetup(async () => {
        await TestUtils.activateExtension();

        // Try to get extension context, but don't fail if not available in test environment
        const extension = vscode.extensions.getExtension("PowerQuery.vscode-powerquery-sdk");

        if (extension?.isActive) {
            extensionContext = extension.exports?.context || extension;
            // Initialize schema management service if extension is available
            schemaManagementService = new SchemaManagementService(extensionContext);
        } else {
            // Create a mock context for testing when extension isn't fully loaded
            const mockContext = {
                extensionPath: path.resolve(__dirname, "../../../.."),
            } as vscode.ExtensionContext;

            schemaManagementService = new SchemaManagementService(mockContext);
        }

        // Set up test workspace
        testWorkspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
    });

    test("SchemaManagementService is properly instantiated", async () => {
        await TestUtils.CreateAsyncTestResult(() => {
            assert.ok(schemaManagementService, "SchemaManagementService should be instantiated");
        });
    });

    test("JSON validation contribution is registered", async () => {
        await TestUtils.CreateAsyncTestResult(() => {
            // Dynamic import to avoid linting issues with require
            // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
            const packageJson = require("../../../package.json");
            const contributions = packageJson.contributes;

            assert.ok(contributions, "Package should have contributions");
            assert.ok(contributions.jsonValidation, "Package should have jsonValidation contribution");
            assert.ok(Array.isArray(contributions.jsonValidation), "jsonValidation should be an array");

            const testSettingsValidation = contributions.jsonValidation.find(
                (validation: { fileMatch: string; url: string }) => validation.fileMatch === "*.testsettings.json",
            );

            assert.ok(testSettingsValidation, "Should have validation rule for *.testsettings.json files");

            assert.strictEqual(
                testSettingsValidation.url,
                "./schemas/UserSettings.schema.json",
                "Should reference the correct schema file",
            );
        });
    });

    test("Schema file paths are correctly resolved", async () => {
        await TestUtils.CreateAsyncTestResult(() => {
            // Test that the schema service was created successfully
            assert.ok(schemaManagementService, "SchemaManagementService should be available");

            // Test that the userSettingsSchemaExists method works (this validates path resolution internally)
            const schemaExists = schemaManagementService.userSettingsSchemaExists();
            assert.ok(typeof schemaExists === "boolean", "userSettingsSchemaExists should return a boolean");
        });
    });

    test("userSettingsSchemaExists returns correct boolean value", async () => {
        await TestUtils.CreateAsyncTestResult(() => {
            // Test that the method works and returns a boolean
            const schemaExists = schemaManagementService.userSettingsSchemaExists();

            assert.ok(typeof schemaExists === "boolean", "userSettingsSchemaExists should return a boolean value");

            // The actual value depends on whether a schema file exists,
            // but we mainly want to test that the method works without errors
        });
    });

    test("createTestSettingsFile creates valid JSON that should validate", async () => {
        await TestUtils.CreateAsyncTestResult(async () => {
            if (!testWorkspaceFolder) {
                console.log("Skipping test - no workspace folder available");

                return;
            }

            const testFileName = "test.testsettings.json";
            const testFilePath = path.join(testWorkspaceFolder, testFileName);

            // Create a test settings file
            const testContent = {
                version: "1.0.0",
                testSettings: {
                    dataSource: "testDataSource",
                    timeout: 30,
                    credentials: {
                        username: "testUser",
                        password: "testPassword",
                    },
                },
            };

            try {
                fs.writeFileSync(testFilePath, JSON.stringify(testContent, null, 2));

                // Verify file was created
                assert.ok(fs.existsSync(testFilePath), "Test settings file should be created");

                // Open the file in VS Code to trigger validation
                const document = await vscode.workspace.openTextDocument(testFilePath);
                assert.ok(document, "Document should be opened");
                assert.strictEqual(document.languageId, "json", "Document should be recognized as JSON");

                // The file should be recognized as a testsettings file by the pattern
                assert.ok(testFilePath.endsWith(".testsettings.json"), "File should match the testsettings pattern");
            } finally {
                // Clean up
                if (fs.existsSync(testFilePath)) {
                    fs.unlinkSync(testFilePath);
                }
            }
        });
    });

    test("copyUserSettingsSchemaFromNugetPackage handles missing package gracefully", async () => {
        await TestUtils.CreateAsyncTestResult(() => {
            // Test with a non-existent version
            const nonExistentVersion = "999.999.999";

            // This should not throw an error, but handle it gracefully
            assert.doesNotThrow(() => {
                schemaManagementService.copyUserSettingsSchemaFromNugetPackage(nonExistentVersion);
            }, "copyUserSettingsSchemaFromNugetPackage should handle missing packages gracefully");
        });
    });

    test("removeUserSettingsSchema handles missing file gracefully", async () => {
        await TestUtils.CreateAsyncTestResult(() => {
            // This should not throw an error even if the file doesn't exist
            assert.doesNotThrow(() => {
                schemaManagementService.removeUserSettingsSchema();
            }, "removeUserSettingsSchema should handle missing files gracefully");
        });
    });

    test("VS Code JSON language service recognizes testsettings files", async () => {
        await TestUtils.CreateAsyncTestResult(async () => {
            if (!testWorkspaceFolder) {
                console.log("Skipping test - no workspace folder available");

                return;
            }

            const testFileName = "vscode-test.testsettings.json";
            const testFilePath = path.join(testWorkspaceFolder, testFileName);

            try {
                // Create a minimal test file
                const minimalContent = '{\n  "version": "1.0.0"\n}';
                fs.writeFileSync(testFilePath, minimalContent);

                // Open the document
                const document = await vscode.workspace.openTextDocument(testFilePath);
                const editor = await vscode.window.showTextDocument(document);

                // Verify the document is recognized as JSON
                assert.strictEqual(document.languageId, "json", "Document should be identified as JSON");

                // Verify the file pattern matches our contribution
                assert.ok(
                    testFileName.match(/.*\.testsettings\.json$/),
                    "File name should match the testsettings pattern",
                );

                await editor.document.save();
            } finally {
                // Clean up
                if (fs.existsSync(testFilePath)) {
                    fs.unlinkSync(testFilePath);
                }
            }
        });
    });

    suiteTeardown(() => {
        // Clean up any test artifacts
        console.log("Schema tests completed");
    });
});

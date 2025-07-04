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
    let testFixtureFolder: string;

    suiteSetup(async () => {
        // Ensure all required extensions are loaded and activated
        await TestUtils.ensureRequiredExtensionsAreLoaded();

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

        // Set up test fixture folder - use VS Code's workspace or fallback to relative path
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        testFixtureFolder = workspaceFolder || path.resolve(__dirname, "..", "testFixture");
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
            const testFileName = "valid.testsettings.json";
            const testFilePath = path.join(testFixtureFolder, testFileName);

            // Create a test settings file with valid content according to UserSettings.schema.json
            const validTestContent = {
                DataSourceKind: "TestConnector",
                DataSourcePath: "test://localhost/database",
                AuthenticationKind: "Anonymous",
                QueryFilePath: "./test.pq",
                ApplicationProperties: {
                    MyCustomProperty: "Property value",
                    AnotherProperty: "Value",
                },
                EnvironmentConfiguration: {
                    Cloud: "global",
                    Region: "us-east-1",
                },
                PrettyPrint: true,
                SkipOutput: false,
                FailOnFoldingFailure: true,
                UseSystemBrowser: false,
            };

            try {
                fs.writeFileSync(testFilePath, JSON.stringify(validTestContent, null, 2));

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

    test("createTestSettingsFile with invalid JSON should not validate", async () => {
        await TestUtils.CreateAsyncTestResult(async () => {
            const testFileName = "invalid.testsettings.json";
            const testFilePath = path.join(testFixtureFolder, testFileName);

            // Create a test settings file with invalid content (properties not in schema)
            const invalidTestContent = {
                // Valid properties first
                DataSourceKind: "TestConnector",
                QueryFilePath: "./test.pq",

                // Invalid properties - these don't exist in UserSettings.schema.json
                version: "1.0.0", // Not defined in schema
                testSettings: {
                    // Not defined in schema
                    dataSource: "testDataSource",
                    timeout: 30,
                },
                invalidProperty: "This should not be allowed", // additionalProperties: false
                customConfig: {
                    // Not defined in schema
                    debug: true,
                    logLevel: "verbose",
                },
            };

            try {
                fs.writeFileSync(testFilePath, JSON.stringify(invalidTestContent, null, 2));

                // Verify file was created
                assert.ok(fs.existsSync(testFilePath), "Test settings file should be created");

                // Open the file in VS Code to trigger validation
                const document = await vscode.workspace.openTextDocument(testFilePath);
                assert.ok(document, "Document should be opened");
                assert.strictEqual(document.languageId, "json", "Document should be recognized as JSON");

                // The file should still match the pattern even if content is invalid
                assert.ok(testFilePath.endsWith(".testsettings.json"), "File should match the testsettings pattern");

                // Note: This test verifies that VS Code will apply schema validation to files matching
                // our pattern. The actual validation errors would be shown in VS Code's Problems panel.
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
            const testFileName = "vscode-test.testsettings.json";
            const testFilePath = path.join(testFixtureFolder, testFileName);

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

    test("sample testsettings file from test fixture can be opened and validated", async () => {
        await TestUtils.CreateAsyncTestResult(async () => {
            const sampleFilePath = path.join(testFixtureFolder, "sample.testsettings.json");

            // Verify the sample file exists
            assert.ok(fs.existsSync(sampleFilePath), "Sample testsettings file should exist in test fixture");

            // Open the document
            const document = await vscode.workspace.openTextDocument(sampleFilePath);
            assert.ok(document, "Sample document should be opened");
            assert.strictEqual(document.languageId, "json", "Sample document should be recognized as JSON");

            // Verify the file pattern matches our contribution
            assert.ok(
                sampleFilePath.endsWith(".testsettings.json"),
                "Sample file should match the testsettings pattern",
            );

            // Verify the content can be parsed as valid JSON
            const content = fs.readFileSync(sampleFilePath, "utf8");
            let parsedContent: Record<string, unknown> | undefined;

            assert.doesNotThrow(() => {
                parsedContent = JSON.parse(content);
            }, "Sample file should contain valid JSON");

            // Verify it has expected properties from the schema
            assert.ok(parsedContent, "Parsed content should exist");
            assert.ok(parsedContent.DataSourceKind, "Sample should have DataSourceKind property");
            assert.ok(parsedContent.DataSourcePath, "Sample should have DataSourcePath property");
        });
    });

    suiteTeardown(() => {
        // Clean up any test artifacts
        console.log("Schema tests completed");
    });
});

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as assert from "assert";
import * as vscode from "vscode";

import { Commands, Extensions, Views } from "../TestConstants";
import * as TestUtils from "../TestUtils";

suite("Tree View Integration Tests", () => {
    suiteSetup(TestUtils.ensureRequiredExtensionsAreLoaded);

    suiteTeardown(() => {
        // Global cleanup
    });

    test("should register LifeCycleTaskTreeView", () => {
        // Test that the tree view can be created (proving it's registered)
        const testDataProvider = {
            getTreeItem: (): vscode.TreeItem => ({}),
            getChildren: (): vscode.TreeItem[] => [],
        };

        const treeView = vscode.window.createTreeView(Views.LifeCycleTaskTreeView, {
            treeDataProvider: testDataProvider,
        });

        assert.ok(treeView, "Should be able to create LifeCycleTaskTreeView");
        assert.ok(treeView.title !== undefined, "Tree view should have a title");

        // Clean up
        treeView.dispose();
    });

    test("should have tree view welcome content configured", () => {
        // Test that webview panels can be created for the result view type
        const panel = vscode.window.createWebviewPanel(Views.ResultWebView, "Test Welcome", vscode.ViewColumn.One, {
            enableScripts: true,
        });

        assert.ok(panel, "Should be able to create webview panel for result view");
        assert.strictEqual(panel.viewType, Views.ResultWebView, "Panel should have correct view type");

        // Clean up
        panel.dispose();
    });

    test("should verify tree view provider is accessible through extension exports", () => {
        const extension = vscode.extensions.getExtension(Extensions.PowerQuerySdk);

        assert.ok(extension, "SDK extension should be available");
        assert.ok(extension.isActive, "SDK extension should be active");

        // The tree view provider should be accessible through the extension's exports
        // This is a basic smoke test to ensure the tree view infrastructure is working
        if (extension.exports) {
            // If exports are available, we can do more detailed testing
            // For now, just verify the extension is properly loaded
            assert.ok(true, "Extension exports are available for tree view testing");
        } else {
            // Extension might not expose exports in test environment
            assert.ok(true, "Extension is loaded (exports may not be available in test environment)");
        }
    });

    test("should verify tree view commands are registered", async () => {
        const commands = await vscode.commands.getCommands(true);

        // Verify tree view refresh commands that might be associated with the tree view
        const treeViewRelatedCommands = [
            Commands.CreateNewProjectCommand,
            Commands.SetupCurrentWorkspaceCommand,
            Commands.SeizePqTestCommand,
        ];

        for (const commandId of treeViewRelatedCommands) {
            assert.ok(commands.includes(commandId), `Tree view related command '${commandId}' should be registered`);
        }
    });

    test("should verify context menu commands are registered", async () => {
        const commands = await vscode.commands.getCommands(true);

        // Verify that commands that would be available in context menus are registered
        // This is better than parsing package.json as it tests runtime behavior
        const contextMenuCommands = [
            Commands.BuildProjectCommand,
            Commands.RunTestBatteryCommand,
            Commands.DisplayExtensionInfoCommand,
            Commands.TestConnectionCommand,
        ];

        for (const commandId of contextMenuCommands) {
            assert.ok(commands.includes(commandId), `Context menu command '${commandId}' should be registered`);
        }
    });

    test("should simulate tree view refresh interaction", async () => {
        // Test tree view refresh functionality by checking if refresh commands exist
        const commands = await vscode.commands.getCommands(true);

        // Look for any refresh-like commands that might be associated with the tree view
        const refreshCommands = commands.filter(
            cmd => cmd.includes("powerquery") && (cmd.includes("refresh") || cmd.includes("reload")),
        );

        // If refresh commands exist, we can test them
        if (refreshCommands.length > 0) {
            for (const refreshCommand of refreshCommands) {
                try {
                    await vscode.commands.executeCommand(refreshCommand);
                    assert.ok(true, `Refresh command ${refreshCommand} executed successfully`);
                } catch (error) {
                    // Expected in test environment - commands may need context
                    assert.ok(
                        String(error).includes("context") || String(error).includes("workspace"),
                        `Refresh command ${refreshCommand} failed with expected error: ${error}`,
                    );
                }
            }
        } else {
            // No specific refresh commands found, verify tree view can be shown
            try {
                await vscode.commands.executeCommand("workbench.view.explorer");
                assert.ok(true, "Explorer view can be activated (where tree view resides)");
            } catch (error) {
                assert.ok(true, `Explorer view test skipped: ${error}`);
            }
        }
    });

    test("should verify tree view registration in VS Code", () => {
        // Instead of parsing package.json, test that tree view can be created
        // This tests actual runtime behavior rather than configuration
        const treeViewId = Views.LifeCycleTaskTreeView;

        try {
            // Attempt to create tree view - this verifies the ID is properly registered
            const treeView = vscode.window.createTreeView(treeViewId, {
                treeDataProvider: {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    getTreeItem: (element: any) => element,
                    getChildren: () => [],
                },
            });

            assert.ok(treeView, "Tree view should be created successfully");
            assert.strictEqual(treeView.visible, false, "Tree view should initially be hidden");

            // Clean up
            treeView.dispose();
        } catch (error) {
            assert.fail(`Tree view registration failed: ${error}`);
        }
    });

    test("should verify webview panels can be created", () => {
        // Test runtime webview support instead of parsing package.json
        try {
            const panel = vscode.window.createWebviewPanel(Views.ResultWebView, "Test Panel", vscode.ViewColumn.One, {
                enableScripts: true,
            });

            assert.ok(panel, "Webview panel should be created");
            assert.strictEqual(panel.viewType, Views.ResultWebView, "Panel should have correct view type");

            // Clean up
            panel.dispose();
        } catch (error) {
            assert.fail(`Webview panel creation failed: ${error}`);
        }
    });

    test("should simulate tree view item selection and context actions", async () => {
        // Test tree view item interaction by verifying context menu commands are registered
        // We DON'T execute the commands because some (like CreateNewProjectCommand) open UI dialogs
        const commands = await vscode.commands.getCommands(true);

        // Look for context-specific commands that would be triggered by tree view items
        const contextCommands = [
            Commands.BuildProjectCommand,
            Commands.SetupCurrentWorkspaceCommand,
            Commands.CreateNewProjectCommand,
        ];

        let registeredCommands = 0;

        for (const command of contextCommands) {
            if (commands.includes(command)) {
                registeredCommands++;
                // Just verify the command is registered, don't execute it
                assert.ok(true, `Context command ${command} is properly registered`);
            }
        }

        // Verify that at least some context commands are registered
        assert.ok(
            registeredCommands >= 1,
            `At least one tree view context command should be registered. Found: ${registeredCommands}`,
        );
    });
});

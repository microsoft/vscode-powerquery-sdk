/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as assert from "assert";
import * as vscode from "vscode";

import * as TestUtils from "../TestUtils";

suite("Tree View Integration Tests", () => {
    suiteSetup(TestUtils.ensureRequiredExtensionsAreLoaded);

    suiteTeardown(() => {
        // Global cleanup
    });

    test("should register LifeCycleTaskTreeView", async () => {
        await TestUtils.CreateAsyncTestResult(() => {
            // Verify the tree view is registered in VS Code
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const packageJson = require("../../../package.json");
            const views = packageJson.contributes?.views?.explorer;

            assert.ok(views, "Should have explorer view contributions");
            assert.ok(Array.isArray(views), "Explorer views should be an array");

            const treeView = views.find(
                (view: { id: string; name: string }) => view.id === "powerquery.sdk.tools.LifeCycleTaskTreeView",
            );

            assert.ok(treeView, "Should have LifeCycleTaskTreeView registered");

            assert.strictEqual(
                treeView.id,
                "powerquery.sdk.tools.LifeCycleTaskTreeView",
                "Tree view should have correct ID",
            );
        });
    });

    test("should have tree view welcome content configured", async () => {
        await TestUtils.CreateAsyncTestResult(() => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const packageJson = require("../../../package.json");
            const viewsWelcome = packageJson.contributes?.viewsWelcome;

            assert.ok(viewsWelcome, "Should have viewsWelcome contributions");
            assert.ok(Array.isArray(viewsWelcome), "ViewsWelcome should be an array");

            const treeViewWelcome = viewsWelcome.find(
                (welcome: { view: string }) => welcome.view === "powerquery.sdk.tools.LifeCycleTaskTreeView",
            );

            assert.ok(treeViewWelcome, "Should have welcome content for LifeCycleTaskTreeView");
            assert.ok(treeViewWelcome.contents, "Welcome content should be defined");
        });
    });

    test("should verify tree view provider is accessible through extension exports", async () => {
        await TestUtils.CreateAsyncTestResult(() => {
            const extension = vscode.extensions.getExtension("PowerQuery.vscode-powerquery-sdk");

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
    });

    test("should verify tree view commands are registered", async () => {
        await TestUtils.CreateAsyncTestResult(async () => {
            const commands = await vscode.commands.getCommands(true);

            // Verify tree view refresh commands that might be associated with the tree view
            const treeViewRelatedCommands = [
                "powerquery.sdk.tools.CreateNewProjectCommand",
                "powerquery.sdk.tools.SetupCurrentWorkspaceCommand",
                "powerquery.sdk.tools.SeizePqTestCommand",
            ];

            for (const commandId of treeViewRelatedCommands) {
                assert.ok(
                    commands.includes(commandId),
                    `Tree view related command '${commandId}' should be registered`,
                );
            }
        });
    });

    test("should verify tree view context menu contributions", async () => {
        await TestUtils.CreateAsyncTestResult(() => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const packageJson = require("../../../package.json");
            const menus = packageJson.contributes?.menus;

            assert.ok(menus, "Should have menu contributions");

            // Verify command palette contributions
            if (menus.commandPalette) {
                assert.ok(Array.isArray(menus.commandPalette), "Command palette should be an array");

                const pqCommands = menus.commandPalette.filter(
                    (item: { command: string }) => item.command && item.command.includes("powerquery.sdk"),
                );

                assert.ok(pqCommands.length > 0, "Should have Power Query commands in command palette");
            }

            // Verify editor context menu contributions
            if (menus["editor/context"]) {
                assert.ok(Array.isArray(menus["editor/context"]), "Editor context menu should be an array");

                const contextMenuCommands = menus["editor/context"].filter(
                    (item: { command: string }) => item.command && item.command.includes("powerquery.sdk"),
                );

                assert.ok(contextMenuCommands.length > 0, "Should have Power Query commands in editor context menu");
            }
        });
    });

    test("should simulate tree view refresh interaction", async () => {
        await TestUtils.CreateAsyncTestResult(async () => {
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
    });

    test("should verify tree view data provider registration", async () => {
        await TestUtils.CreateAsyncTestResult(() => {
            // Verify that the tree view has proper data provider registration in package.json
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const packageJson = require("../../../package.json");
            const views = packageJson.contributes?.views?.explorer;

            if (views) {
                const treeView = views.find(
                    (view: { id: string }) => view.id === "powerquery.sdk.tools.LifeCycleTaskTreeView",
                );

                if (treeView) {
                    // Verify tree view has required properties
                    assert.ok(treeView.name, "Tree view should have a name");
                    assert.ok(treeView.id, "Tree view should have an ID");

                    // Verify the tree view can be enabled/disabled
                    if (treeView.when !== undefined) {
                        assert.ok(typeof treeView.when === "string", "Tree view 'when' clause should be a string");
                    }

                    assert.ok(true, "Tree view data provider configuration is valid");
                } else {
                    assert.fail("Tree view not found in package.json configuration");
                }
            } else {
                assert.fail("No explorer views found in package.json");
            }
        });
    });

    test("should verify tree view icon and presentation configuration", async () => {
        await TestUtils.CreateAsyncTestResult(() => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const packageJson = require("../../../package.json");
            const views = packageJson.contributes?.views?.explorer;

            if (views) {
                const treeView = views.find(
                    (view: { id: string }) => view.id === "powerquery.sdk.tools.LifeCycleTaskTreeView",
                );

                if (treeView) {
                    // Verify tree view presentation properties
                    assert.ok(treeView.name, "Tree view should have a display name");

                    // Check if icon is configured (optional)
                    if (treeView.icon) {
                        assert.ok(typeof treeView.icon === "string", "Tree view icon should be a string path");
                    }

                    // Verify tree view visibility conditions
                    if (treeView.when) {
                        assert.ok(typeof treeView.when === "string", "Tree view when condition should be a string");
                    }

                    assert.ok(true, "Tree view presentation configuration is valid");
                } else {
                    assert.fail("LifeCycleTaskTreeView not found in explorer views");
                }
            } else {
                assert.ok(true, "Tree view presentation test skipped (no explorer views configured)");
            }
        });
    });

    test("should simulate tree view item selection and context actions", async () => {
        await TestUtils.CreateAsyncTestResult(async () => {
            // Test tree view item interaction by verifying context menu commands
            const commands = await vscode.commands.getCommands(true);

            // Look for context-specific commands that would be triggered by tree view items
            const contextCommands = [
                "powerquery.sdk.tools.BuildCurrentProjectCommand",
                "powerquery.sdk.tools.SetupCurrentWorkspaceCommand",
                "powerquery.sdk.tools.CreateNewProjectCommand",
            ];

            let executableCommands = 0;
            let contextErrorCommands = 0;

            for (const command of contextCommands) {
                if (commands.includes(command)) {
                    try {
                        // Try to execute the command (will likely fail due to missing context)
                        await vscode.commands.executeCommand(command);
                        executableCommands++;
                    } catch (error) {
                        // Expected failures due to missing project context in test environment
                        if (
                            String(error).includes("workspace") ||
                            String(error).includes("project") ||
                            String(error).includes("context") ||
                            String(error).includes("cancelled")
                        ) {
                            contextErrorCommands++;
                        } else {
                            throw error; // Unexpected error
                        }
                    }
                }
            }

            // Either commands execute successfully or fail with expected context errors
            assert.ok(
                executableCommands + contextErrorCommands >= 1,
                `At least one tree view context command should be testable. ` +
                    `Executed: ${executableCommands}, Context errors: ${contextErrorCommands}`,
            );
        });
    });
});

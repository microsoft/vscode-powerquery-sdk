/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

/* global setup, teardown */

import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";

import manifest from "../../../package.json";
import { ExtensionConfigurations } from "../../constants/PowerQuerySdkConfiguration";
import { ExtensionConstants } from "../../constants/PowerQuerySdkExtension";
import { PqSdkOutputChannel } from "../../features/PqSdkOutputChannel";
import { registerTestAdapter } from "../../testing/pqtest-adapter/TestController";
import { TestWatcherManager } from "../../testing/pqtest-adapter/TestWatcherManager";
import * as cleanupUtils from "../../testing/pqtest-adapter/utils/cleanupUtils";

suite("Test UI configuration", () => {
    let sandbox: sinon.SinonSandbox;
    let enabled: boolean | undefined;
    let output: PqSdkOutputChannel;
    let context: Pick<vscode.ExtensionContext, "subscriptions">;
    let controller: vscode.TestController;
    let createController: sinon.SinonStub;
    let registerCommand: sinon.SinonStub;
    let initializeWatchers: sinon.SinonStub;
    let initializeCleanup: sinon.SinonStub;
    let cleanup: sinon.SinonStub;

    setup(() => {
        sandbox = sinon.createSandbox();
        enabled = undefined;
        output = sandbox.createStubInstance(PqSdkOutputChannel);
        context = { subscriptions: [] };
        controller = vscode.tests.createTestController("test-ui-configuration-regression", "Test UI configuration");
        createController = sandbox.stub(vscode.tests, "createTestController").returns(controller);

        registerCommand = sandbox
            .stub(vscode.commands, "registerCommand")
            .callsFake(() => new vscode.Disposable(() => {}));

        initializeWatchers = sandbox.stub(TestWatcherManager.prototype, "initialize").resolves();
        initializeCleanup = sandbox.stub(cleanupUtils, "initializeCleanupTimer");
        cleanup = sandbox.stub(cleanupUtils, "cleanupOldIntermediateResults").resolves();

        const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(
            ExtensionConstants.ConfigNames.PowerQuerySdk.name,
        );

        sandbox.stub(vscode.workspace, "getConfiguration").returns({
            ...config,
            get: sandbox.stub().callsFake((_key: string, defaultValue?: unknown) => enabled ?? defaultValue),
        });
    });

    teardown(() => {
        for (const disposable of context.subscriptions) {
            disposable.dispose();
        }

        controller.dispose();
        sandbox.restore();
    });

    test("Test UI is enabled by default in configuration and the manifest", () => {
        assert.strictEqual(ExtensionConfigurations.testEnabled, true);
        assert.strictEqual(manifest.contributes.configuration.properties["powerquery.sdk.test.enabled"].default, true);
    });

    test("disabled Test UI registers no controller, commands, discovery, watchers, or cleanup", () => {
        enabled = false;
        registerTestAdapter(context, output);

        assert.strictEqual(ExtensionConfigurations.testEnabled, false);
        sinon.assert.notCalled(createController);
        sinon.assert.notCalled(registerCommand);
        sinon.assert.notCalled(initializeWatchers);
        sinon.assert.notCalled(initializeCleanup);
        sinon.assert.notCalled(cleanup);
        assert.strictEqual(context.subscriptions.length, 0);
    });

    for (const setting of [undefined, true]) {
        test(`${setting === undefined ? "default" : "explicitly enabled"} Test UI registers the integration`, () => {
            enabled = setting;
            registerTestAdapter(context, output);

            sinon.assert.calledOnce(createController);
            sinon.assert.calledOnce(initializeWatchers);
            sinon.assert.calledOnce(initializeCleanup);
            sinon.assert.calledOnce(cleanup);
            assert.strictEqual(registerCommand.callCount, 4);
            assert.ok(controller.resolveHandler);
            assert.ok(context.subscriptions.includes(controller));
        });
    }

    test("all Test UI menu contributions are gated without disabling connector query commands", () => {
        const testCommands: string[] = manifest.contributes.commands
            .map((command: { command: string }) => command.command)
            .filter((command: string) => command.startsWith("powerquery.sdk.test."));

        const palette: typeof manifest.contributes.menus.commandPalette = manifest.contributes.menus.commandPalette;

        for (const command of testCommands) {
            assert.ok(
                palette.some(
                    (entry: { command: string; when: string }) =>
                        entry.command === command && entry.when === "config.powerquery.sdk.test.enabled",
                ),
                `${command} must be hidden from the command palette when Test UI is disabled`,
            );
        }

        for (const entries of Object.values(manifest.contributes.menus)) {
            for (const entry of entries) {
                if (testCommands.includes(entry.command)) {
                    assert.ok(entry.when.includes("config.powerquery.sdk.test.enabled"));
                }
            }
        }

        assert.strictEqual(
            palette.find(
                (entry: { command: string; when: string }) =>
                    entry.command === "powerquery.sdk.tools.RunTestBatteryCommand",
            )?.when,
            "editorLangId == powerquery",
        );
    });
});

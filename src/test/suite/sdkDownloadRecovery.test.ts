/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

/* global setup, teardown */

import * as assert from "assert";
import * as sinon from "sinon";
import { setImmediate } from "timers";
import * as vscode from "vscode";

import { LifecycleCommands } from "../../commands/LifecycleCommands";
import { PqSdkNugetPackageService } from "../../common/PqSdkNugetPackageService";
import { ExtensionConfigurations } from "../../constants/PowerQuerySdkConfiguration";
import { PqSdkOutputChannel } from "../../features/PqSdkOutputChannel";
import { extensionI18n } from "../../i18n/extension";
import { initializeLocalSdkTools } from "../../utils/localSdkTools";

suite("SDK download recovery notifications", () => {
    let sandbox: sinon.SinonSandbox;
    let commands: LifecycleCommands;
    let packages: sinon.SinonStubbedInstance<PqSdkNugetPackageService>;
    let output: sinon.SinonStubbedInstance<PqSdkOutputChannel>;
    let notification: sinon.SinonStub;
    let selectAction: (action: string | undefined) => void;

    setup(() => {
        sandbox = sinon.createSandbox();
        initializeLocalSdkTools(false);
        packages = sandbox.createStubInstance(PqSdkNugetPackageService);
        packages.waitForConfiguredPackages.resolves();
        packages.findNullableNewPqSdkVersion.resolves("2.160.2");
        packages.nugetPqSdkExistsSync.returns(false);
        packages.updatePqSdkFromNuget.resolves(undefined);
        output = sandbox.createStubInstance(PqSdkOutputChannel);
        sandbox.stub(ExtensionConfigurations, "PQTestLocation").get(() => undefined);
        sandbox.stub(vscode.window, "showOpenDialog").rejects(new Error("Unexpected file picker"));

        notification = sandbox.stub(vscode.window, "showErrorMessage");

        notification.returns(
            new Promise<string | undefined>((resolve: (action: string | undefined) => void) => {
                selectAction = resolve;
            }),
        );

        // Exercise the real orchestration without registering commands or starting activation.
        commands = Object.assign(Object.create(LifecycleCommands.prototype), {
            pqSdkNugetPackageService: packages,
            pqTestService: { pqTestReady: false },
            outputChannel: output,
        });
    });

    teardown(() => {
        selectAction(undefined);
        sandbox.restore();
        initializeLocalSdkTools(false);
    });

    function run(operation: "startup" | "manual"): Promise<string | undefined> {
        const result =
            operation === "startup" ? commands["doCheckAndTryToUpdatePqTest"](true) : commands.manuallyUpdatePqTest();

        return Promise.race([
            result,
            new Promise<never>((_resolve, reject) => {
                setImmediate(() => reject(new Error("Update waited for notification dismissal")));
            }),
        ]);
    }

    for (const operation of ["startup", "manual"] as const) {
        for (const failure of ["lookup", "download", "missing executable"] as const) {
            test(`${operation}: ${failure} logs diagnostics and finishes before notification dismissal`, async () => {
                const detail = `Underlying ${failure} diagnostic`;

                if (failure === "lookup") {
                    packages.findNullableNewPqSdkVersion.rejects(new Error(detail));
                } else if (failure === "download") {
                    packages.updatePqSdkFromNuget.rejects(new Error(detail));
                }

                assert.strictEqual(await run(operation), undefined);
                sinon.assert.calledOnce(notification);

                assert.strictEqual(
                    notification.firstCall.args[0],
                    `${extensionI18n["PQSdk.lifecycle.sdkTool.download.errorMessage"]} ${extensionI18n["PQSdk.lifecycle.sdkTool.download.guidance"]}`,
                );

                assert.ok(!notification.firstCall.args[0].includes(detail));

                sinon.assert.calledWith(
                    output.appendErrorLine,
                    extensionI18n["PQSdk.lifecycle.sdkTool.download.guidance"],
                );

                assert.ok(
                    output.appendErrorLine
                        .getCalls()
                        .some(call =>
                            String(call.args[0]).includes(
                                failure === "missing executable"
                                    ? extensionI18n["PQSdk.lifecycle.warning.pqtest.seized.failed"]
                                    : detail,
                            ),
                        ),
                );

                sinon.assert.notCalled(packages.cleanupUnusedPackages);
            });
        }

        for (const action of ["openSettings", "troubleshooting", "showOutput"] as const) {
            test(`${operation}: dispatches the ${action} recovery action`, async () => {
                const execute = sandbox.stub(vscode.commands, "executeCommand").resolves();
                const open = sandbox.stub(vscode.env, "openExternal").resolves(true);
                await run(operation);
                const label = extensionI18n[`PQSdk.lifecycle.sdkTool.download.${action}`];
                assert.ok(notification.firstCall.args.slice(1).includes(label));
                selectAction(label);
                await new Promise<void>((resolve: () => void) => setImmediate(resolve));

                if (action === "openSettings") {
                    sinon.assert.calledOnceWithExactly(
                        execute,
                        "workbench.action.openSettings",
                        "powerquery.sdk.externals.nuget",
                    );

                    sinon.assert.notCalled(open);
                    sinon.assert.notCalled(output.show);
                } else if (action === "troubleshooting") {
                    sinon.assert.calledOnce(open);

                    assert.strictEqual(
                        open.firstCall.args[0].toString(),
                        "https://github.com/microsoft/vscode-powerquery-sdk/blob/main/README.md#sdk-tools-download-and-network-troubleshooting",
                    );

                    sinon.assert.notCalled(execute);
                    sinon.assert.notCalled(output.show);
                } else {
                    sinon.assert.calledOnce(output.show);
                    assert.deepStrictEqual(output.show.firstCall.args, [true]);
                    sinon.assert.notCalled(execute);
                    sinon.assert.notCalled(open);
                }
            });
        }
    }
});

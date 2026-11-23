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

import { PqSdkOutputChannel } from "../../features/PqSdkOutputChannel";
import { TestRunCoordinator } from "../../testing/pqtest-adapter/TestRunCoordinator";
import { TestRunExecutor } from "../../testing/pqtest-adapter/TestRunExecutor";
import * as pathUtils from "../../testing/pqtest-adapter/utils/pathUtils";
import { createCompositeId } from "../../testing/pqtest-adapter/utils/testUtils";

suite("Test run coordinator filter errors", () => {
    const filterError: string = "QueryFilePath could not be resolved";

    let sandbox: sinon.SinonSandbox;
    let controller: vscode.TestController;
    let settingsItem: vscode.TestItem;
    let brokenFolder: vscode.TestItem;
    let brokenLeaves: vscode.TestItem[];
    let workingItem: vscode.TestItem;
    let errored: sinon.SinonStub;
    let addTestItem: sinon.SinonStub;
    let execute: sinon.SinonStub;

    function createChild(id: string, uri: vscode.Uri): vscode.TestItem {
        return controller.createTestItem(createCompositeId(id, settingsItem.uri!), id, uri);
    }

    async function run(include: vscode.TestItem[]): Promise<void> {
        const testRun: vscode.TestRun = { errored } as unknown as vscode.TestRun;

        await new TestRunCoordinator(
            new vscode.TestRunRequest(include),
            testRun,
            "PQTest.exe",
            controller,
            sandbox.createStubInstance(PqSdkOutputChannel),
            new vscode.CancellationTokenSource().token,
        ).run();
    }

    setup(() => {
        sandbox = sinon.createSandbox();
        controller = vscode.tests.createTestController("test-run-coordinator-regression", "Test run coordinator");

        const settingsUri: vscode.Uri = vscode.Uri.file("C:\\fixture\\connector.testsettings.json");
        settingsItem = controller.createTestItem(settingsUri.toString(), "connector.testsettings.json", settingsUri);
        controller.items.add(settingsItem);

        brokenFolder = createChild("broken", vscode.Uri.file("C:\\fixture\\broken"));

        brokenLeaves = ["a", "b"].map((name: string) =>
            createChild(`broken/${name}`, vscode.Uri.file(`C:\\fixture\\broken\\${name}.query.pq`)),
        );

        brokenFolder.children.replace(brokenLeaves);
        workingItem = createChild("working", vscode.Uri.file("C:\\fixture\\working.query.pq"));
        settingsItem.children.replace([brokenFolder, workingItem]);

        sandbox.stub(vscode.workspace, "fs").value({
            stat: sandbox.stub().resolves({ type: vscode.FileType.File, ctime: 0, mtime: 0, size: 0 }),
        });

        sandbox.stub(pathUtils, "getRelativeTestPath").callsFake((uri: vscode.Uri): Promise<string> => {
            if (uri.fsPath.includes("broken")) {
                return Promise.reject(new Error(filterError));
            }

            return Promise.resolve("working.query.pq");
        });

        errored = sandbox.stub();
        addTestItem = sandbox.stub(TestRunExecutor.prototype, "addTestItem");
        execute = sandbox.stub(TestRunExecutor.prototype, "execute").resolves();
    });

    teardown(() => {
        controller.dispose();
        sandbox.restore();
    });

    test("marks leaves errored when their filter fails and runs only the remaining tests", async () => {
        await run([brokenFolder, workingItem]);

        assert.deepStrictEqual(
            errored.getCalls().map((call: sinon.SinonSpyCall) => [call.args[0], call.args[1].message]),
            brokenLeaves.map((leaf: vscode.TestItem) => [leaf, filterError]),
        );

        assert.deepStrictEqual(
            addTestItem.getCalls().map((call: sinon.SinonSpyCall) => call.args[0]),
            [workingItem],
        );

        sinon.assert.calledOnceWithExactly(execute, ["--testFilter", "working.query.pq"]);
    });

    test("marks leaves errored and skips execution when no filter can be generated", async () => {
        await run(brokenLeaves);

        assert.deepStrictEqual(
            errored.getCalls().map((call: sinon.SinonSpyCall) => call.args[0]),
            brokenLeaves,
        );

        sinon.assert.notCalled(addTestItem);
        sinon.assert.notCalled(execute);
    });
});

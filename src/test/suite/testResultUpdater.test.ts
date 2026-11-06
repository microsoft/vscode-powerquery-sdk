/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

/* global setup, teardown */

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";
import * as vscode from "vscode";

import { PqSdkOutputChannel } from "../../features/PqSdkOutputChannel";
import { extensionI18n } from "../../i18n/extension";
import { TestResult, TestStatus } from "../../testing/pqtest-adapter/helpers/PqTestResultParser";
import { TestResultUpdater } from "../../testing/pqtest-adapter/helpers/TestResultUpdater";

suite("TestResultUpdater", () => {
    let sandbox: sinon.SinonSandbox;
    let controller: vscode.TestController;
    let testRun: vscode.TestRun;
    let testItem: vscode.TestItem;
    let updater: TestResultUpdater;
    let failed: sinon.SinonStub<Parameters<vscode.TestRun["failed"]>, void>;
    let errored: sinon.SinonStub<Parameters<vscode.TestRun["errored"]>, void>;
    let directory: string;

    setup(() => {
        sandbox = sinon.createSandbox();
        directory = fs.mkdtempSync(path.join(os.tmpdir(), "pq-test-result-updater-"));
        controller = vscode.tests.createTestController("pq-test-result-updater", "PQTest result updater");
        testItem = controller.createTestItem("query", "query", vscode.Uri.file(path.join(directory, "Test.query.pq")));
        controller.items.add(testItem);
        testRun = controller.createTestRun(new vscode.TestRunRequest([testItem]));
        failed = sandbox.stub(testRun, "failed");
        errored = sandbox.stub(testRun, "errored");
        updater = new TestResultUpdater(testRun, sandbox.createStubInstance(PqSdkOutputChannel));
    });

    teardown(() => {
        testRun.end();
        controller.dispose();
        sandbox.restore();
        fs.rmSync(directory, { recursive: true, force: true });
    });

    function createResult(status: TestStatus, reason?: string): TestResult {
        return { filePath: testItem.uri!.fsPath, status, reason, durationMs: 125 };
    }

    function reportedMessage(stub: sinon.SinonStub<Parameters<vscode.TestRun["failed"]>, void>): vscode.TestMessage {
        sinon.assert.calledOnce(stub);
        assert.strictEqual(stub.firstCall.args[0], testItem);
        assert.strictEqual(stub.firstCall.args[2], 125);

        const message: vscode.TestMessage | readonly vscode.TestMessage[] = stub.firstCall.args[1];
        assert.ok(message instanceof vscode.TestMessage);

        return message;
    }

    test("shows the missing baseline path and structured details for a failed test", async () => {
        const result: TestResult = createResult(TestStatus.Failed, "OutputFileMissing");

        result.error = {
            message: `Expected output file is missing: ${path.join(directory, "Test.pqout")}`,
            details: { ExpectedOutputFile: path.join(directory, "Test.pqout") },
        };

        await updater.updateTestResult(testItem, result);

        assert.strictEqual(
            reportedMessage(failed).message,
            result.error.message +
                extensionI18n["PQSdk.testAdapter.updater.errorDetailsPrefix"] +
                JSON.stringify(result.error.details, null, 2),
        );

        sinon.assert.notCalled(errored);
    });

    test("shows the folding error rather than only its status reason", async () => {
        const result: TestResult = createResult(TestStatus.Failed, "FoldingFailure");
        result.error = { message: 'Query did not fold.\n[Reason = "FoldingFailure", Detail = "Join step"]' };

        await updater.updateTestResult(testItem, result);

        assert.strictEqual(reportedMessage(failed).message, result.error.message);
    });

    test("retains the reason when an older SDK provides no error object", async () => {
        await updater.updateTestResult(testItem, createResult(TestStatus.Failed, "OutputFileMissing"));

        assert.strictEqual(reportedMessage(failed).message, "OutputFileMissing");
    });

    test("retains the generic failure fallback when no message or reason is available", async () => {
        const result: TestResult = createResult(TestStatus.Failed);
        result.error = { message: "" };

        await updater.updateTestResult(testItem, result);

        assert.strictEqual(reportedMessage(failed).message, extensionI18n["PQSdk.testAdapter.updater.testFailed"]);
    });

    test("preserves source error messages and structured details for errored tests", async () => {
        const result: TestResult = createResult(TestStatus.Error, "SourceError");
        result.error = { message: "Example driver not found", details: { Driver: "Example driver" } };

        await updater.updateTestResult(testItem, result);

        assert.strictEqual(
            reportedMessage(errored).message,
            result.error.message +
                extensionI18n["PQSdk.testAdapter.updater.errorDetailsPrefix"] +
                JSON.stringify(result.error.details, null, 2),
        );

        sinon.assert.notCalled(failed);
    });

    test("preserves the unknown error fallback for older SDK results", async () => {
        await updater.updateTestResult(testItem, createResult(TestStatus.Error, "SourceError"));

        assert.strictEqual(reportedMessage(errored).message, extensionI18n["PQSdk.testAdapter.updater.unknownError"]);
    });

    for (const reason of ["OutputFileMismatch", "DiagnosticsFileMismatch"]) {
        test(`preserves expected and actual diff output for ${reason}`, async () => {
            const expectedPath: string = path.join(directory, "expected.pqout");
            const actualPath: string = path.join(directory, "actual.pqout");
            fs.writeFileSync(expectedPath, "1");
            fs.writeFileSync(actualPath, "2");

            const result: TestResult = createResult(TestStatus.Failed, reason);
            result.error = { message: "Comparison failed" };

            if (reason === "OutputFileMismatch") {
                result.expectedTestResultFilePath = expectedPath;
                result.actualTestResultFilePath = actualPath;
            } else {
                result.expectedDiagnosticsFilePaths = { odbc: expectedPath };
                result.actualDiagnosticsFilePaths = { odbc: actualPath };
            }

            await updater.updateTestResult(testItem, result);

            const message: vscode.TestMessage = reportedMessage(failed);
            assert.strictEqual(message.expectedOutput, "1");
            assert.strictEqual(message.actualOutput, "2");
            sinon.assert.notCalled(errored);
        });
    }
});

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as fs from "fs";
import * as vscode from "vscode";

import { TestResult, TestStatus } from "./PqTestResultParser";
import { PqSdkOutputChannel } from "../../../features/PqSdkOutputChannel";
import { fileExists } from "../../../utils/files";
import { extensionI18n, resolveI18nTemplate } from "../../../i18n/extension";

/**
 * Context type for file comparison operations.
 */
enum ComparisonContext {
    TestResult = "test result",
    Diagnostic = "diagnostic",
}

/**
 * Handles all VS Code TestRun UI updates.
 * This class is a command receiver that responds to instructions from TestRunExecutor.
 */
export class TestResultUpdater {
    constructor(
        private testRun: vscode.TestRun,
        private outputChannel: PqSdkOutputChannel
    ) {}

    /**
     * Marks a test as enqueued in the UI.
     */
    public enqueueTest(test: vscode.TestItem): void {
        this.testRun.enqueued(test);
    }

    /**
     * Marks a test as started in the UI.
     */
    public markTestAsStarted(test: vscode.TestItem): void {
        this.testRun.started(test);
    }

    /**
     * Appends a line of output to the test run, optionally associated with a specific test.
     */
    public appendOutput(line: string, currentTest?: vscode.TestItem): void {
        this.testRun.appendOutput(`${line}\r\n`, undefined, currentTest);
    }

    /**
     * Updates a test with its final result (passed, failed, or error).
     */
    public async updateTestResult(testItem: vscode.TestItem, result: TestResult): Promise<void> {
        if (!testItem.uri) {
            throw new Error(
                resolveI18nTemplate("PQSdk.testAdapter.updater.expectedTestItemToHaveUri", {
                    testId: testItem.id,
                })
            );
        }

        const durationMs = result.durationMs;

        if (result.status === TestStatus.Passed) {
            this.testRun.passed(testItem, durationMs);
        } else if (result.status === TestStatus.Failed) {
            const failedMessage = new vscode.TestMessage(
                result.reason || extensionI18n["PQSdk.testAdapter.updater.testFailed"]
            );

            // Handle different failure reasons
            if (result.reason === "OutputFileMismatch") {
                await this.handleOutputFileMismatch(failedMessage, result);
            } else if (result.reason === "DiagnosticsFileMismatch") {
                await this.handleDiagnosticsFileMismatch(failedMessage, result);
            }

            this.testRun.failed(testItem, failedMessage, durationMs);
        } else if (result.status === TestStatus.Error) {
            const errorMessage =
                result.error?.message || extensionI18n["PQSdk.testAdapter.updater.unknownError"];
            const testMessage = new vscode.TestMessage(errorMessage);

            // Optionally include error details in the message
            if (result.error?.details) {
                testMessage.message +=
                    extensionI18n["PQSdk.testAdapter.updater.errorDetailsPrefix"] +
                    JSON.stringify(result.error.details, null, 2);
            }

            this.testRun.errored(testItem, testMessage, durationMs);
        }
    }

    /**
     * Handles output file mismatch by comparing expected and actual test result files.
     */
    private async handleOutputFileMismatch(
        failedMessage: vscode.TestMessage,
        result: TestResult
    ): Promise<void> {
        // If we have expected and actual output files in the output, add them to the TestMessage.
        if (result.expectedTestResultFilePath && result.actualTestResultFilePath) {
            await this.compareFiles(
                failedMessage,
                result.expectedTestResultFilePath,
                result.actualTestResultFilePath,
                ComparisonContext.TestResult
            );
        }
    }

    /**
     * Handles diagnostics file mismatch by comparing expected and actual diagnostic files.
     */
    private async handleDiagnosticsFileMismatch(
        failedMessage: vscode.TestMessage,
        result: TestResult
    ): Promise<void> {
        // Check if we have the required diagnostic file paths
        if (!result.actualDiagnosticsFilePaths || !result.expectedDiagnosticsFilePaths) {
            failedMessage.message += extensionI18n["PQSdk.testAdapter.updater.diagnosticsFilePathsNotProvided"];
            return;
        }

        const channels = Object.keys(result.actualDiagnosticsFilePaths);
        if (channels.length === 0) {
            failedMessage.message += extensionI18n["PQSdk.testAdapter.updater.noDiagnosticChannelsFound"];
            return;
        }

        const firstChannel = channels[0];

        // Log a message if multiple channels exist
        if (channels.length > 1) {
            const channelList = channels.join(", ");
            this.outputChannel.appendLine(
                resolveI18nTemplate("PQSdk.testAdapter.updater.multipleDiagnosticChannelsFoundLog", {
                    channelList,
                    firstChannel,
                })
            );
            failedMessage.message += resolveI18nTemplate(
                "PQSdk.testAdapter.updater.multipleDiagnosticChannelsFoundMessage",
                { channelList }
            );
        }

        // Get the first channel from actual diagnostics as only one channel should exist at a time.
        const actualDiagPath = result.actualDiagnosticsFilePaths[firstChannel];

        // Check if the same channel exists in expected
        const expectedDiagPath = result.expectedDiagnosticsFilePaths[firstChannel];
        if (!expectedDiagPath) {
            failedMessage.message += resolveI18nTemplate(
                "PQSdk.testAdapter.updater.expectedDiagnosticsFileNotFound",
                { channel: firstChannel }
            );
            this.outputChannel.appendLine(
                resolveI18nTemplate("PQSdk.testAdapter.updater.missingExpectedDiagnosticFileLog", {
                    channel: firstChannel,
                })
            );
            return;
        }

        // Update the message to indicate which channel we're comparing
        failedMessage.message = resolveI18nTemplate(
            "PQSdk.testAdapter.updater.diagnosticsFileMismatchForChannel",
            { channel: firstChannel }
        );

        await this.compareFiles(failedMessage, expectedDiagPath, actualDiagPath, ComparisonContext.Diagnostic);
    }

    /**
     * Compares expected and actual files and updates the test message with the comparison results.
     * @param failedMessage The test message to update with comparison results
     * @param expectedFilePath Path to the expected output file
     * @param actualFilePath Path to the actual output file
     * @param context Context type for logging and error messages
     */
    private async compareFiles(
        failedMessage: vscode.TestMessage,
        expectedFilePath: string,
        actualFilePath: string,
        context: ComparisonContext
    ): Promise<void> {
        try {
            // Check if both files exist before attempting to read them
            const expectedFileExists = await fileExists(expectedFilePath);
            const actualFileExists = await fileExists(actualFilePath);

            if (expectedFileExists && actualFileExists) {
                // Read both files and set them for diff view
                failedMessage.actualOutput = await fs.promises.readFile(actualFilePath, "utf8");
                failedMessage.expectedOutput = await fs.promises.readFile(expectedFilePath, "utf8");
            } else {
                // Determine which files are missing for a detailed error message
                const missingFiles = [
                    !expectedFileExists ? "expected" : "",
                    !actualFileExists ? "actual" : "",
                ]
                    .filter(Boolean)
                    .join(" and ");

                // Add a note to the test message indicating the missing files
                failedMessage.message += resolveI18nTemplate(
                    "PQSdk.testAdapter.updater.cannotShowTestDifferences",
                    { missingFiles }
                );

                // Also show a notification to the user
                void vscode.window.showErrorMessage(
                    extensionI18n["PQSdk.testAdapter.updater.comparisonFilesNotFound"]
                );

                // Log appropriate message based on context
                if (context === ComparisonContext.TestResult) {
                    this.outputChannel.appendLine(
                        resolveI18nTemplate("PQSdk.testAdapter.updater.missingTestFiles", {
                            expectedFile: expectedFilePath,
                            actualFile: actualFilePath,
                        })
                    );
                } else if (context === ComparisonContext.Diagnostic) {
                    this.outputChannel.appendLine(
                        resolveI18nTemplate("PQSdk.testAdapter.updater.missingDiagnosticFilesLog", {
                            expectedFile: expectedFilePath,
                            actualFile: actualFilePath,
                        })
                    );
                }
            }
        } catch (error) {
            // Handle file reading errors
            const errorMessage = error instanceof Error ? error.message : String(error);

            // Log appropriate message based on context
            if (context === ComparisonContext.TestResult) {
                this.outputChannel.appendLine(
                    resolveI18nTemplate("PQSdk.testAdapter.updater.errorReadingTestResultFiles", {
                        error: errorMessage,
                    })
                );
            } else if (context === ComparisonContext.Diagnostic) {
                this.outputChannel.appendLine(
                    resolveI18nTemplate("PQSdk.testAdapter.updater.errorReadingDiagnosticFiles", {
                        error: errorMessage,
                    })
                );
            }

            failedMessage.message += resolveI18nTemplate(
                "PQSdk.testAdapter.updater.errorReadingComparisonFiles",
                { error: errorMessage }
            );
        }
    }
}

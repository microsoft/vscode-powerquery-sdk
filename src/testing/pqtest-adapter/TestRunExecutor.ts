/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

/**
 * Executes tests for a single settings file using the new modular architecture.
 * Orchestrates test execution lifecycle from command building to result processing.
 */

import * as path from "path";
import * as vscode from "vscode";

import { SpawnedProcessStreaming } from "../../common/SpawnedProcessStreaming";
import { PqSdkOutputChannel } from "../../features/PqSdkOutputChannel";
import { extensionI18n, resolveI18nTemplate } from "../../i18n/extension";
import { getNormalizedPath } from "./utils/pathUtils";
import { buildIntermediateResultsArgs, determineExtensionsForTests } from "./utils/testSettingsUtils";
import { PqTestCommandBuilder } from "./helpers/PqTestCommandBuilder";
import { PqTestResultEventType, PqTestResultParser } from "./helpers/PqTestResultParser";
import { TestResultUpdater } from "./helpers/TestResultUpdater";

/**
 * State machine for test execution
 */
enum ExecutionState {
    NotStarted = "NotStarted",
    Running = "Running",
    Completed = "Completed",
    Cancelled = "Cancelled",
}

export class TestRunExecutor {
    private state: ExecutionState = ExecutionState.NotStarted;
    private readonly testItems: vscode.TestItem[] = [];

    constructor(
        private readonly pqTestPath: string,
        private readonly settingsFile: vscode.Uri,
        private readonly testRun: vscode.TestRun,
        private readonly outputChannel: PqSdkOutputChannel,
        private readonly cancellationToken: vscode.CancellationToken,
    ) {}

    /**
     * Adds a test item to be executed in this run.
     *
     * @param testItem - The test item to add
     */
    addTestItem(testItem: vscode.TestItem): void {
        this.testItems.push(testItem);
    }

    /**
     * Executes the test run with optional additional command-line arguments.
     *
     * @param additionalArgs - Optional additional arguments for PQTest.exe (e.g., test filters)
     */
    async execute(additionalArgs?: string[]): Promise<void> {
        if (this.state !== ExecutionState.NotStarted) {
            throw new Error(`Cannot execute: state is ${this.state}`);
        }

        this.state = ExecutionState.Running;

        this.outputChannel.appendDebugLine(
            resolveI18nTemplate("PQSdk.testAdapter.executor.startingTestExecution", {
                testCount: this.testItems.length.toString(),
            }),
        );

        this.outputChannel.appendDebugLine(
            resolveI18nTemplate("PQSdk.testAdapter.executor.settingsFile", {
                settingsFilePath: this.settingsFile.fsPath,
            }),
        );

        const workingDirectory = path.dirname(this.settingsFile.fsPath);

        this.outputChannel.appendDebugLine(
            resolveI18nTemplate("PQSdk.testAdapter.executor.workingDirectory", {
                workingDirectory,
            }),
        );

        try {
            // Step 1: Determine which extension(s) to use based on precedence rules
            const extensions = await determineExtensionsForTests(this.settingsFile.fsPath, this.outputChannel);

            // Step 2: Build intermediate results arguments
            const intermediateResultsArgs = await buildIntermediateResultsArgs(
                this.settingsFile.fsPath,
                this.outputChannel,
            );

            // Step 3: Build the lookup map for test items
            const runItemsMap = new Map<string, vscode.TestItem>();

            this.testItems.forEach(item => {
                if (item.uri) {
                    const normalizedPath = getNormalizedPath(item.uri.fsPath);
                    runItemsMap.set(normalizedPath, item);
                }
            });

            // Step 4: Build the command using PqTestCommandBuilder
            const commandBuilder = new PqTestCommandBuilder("run-compare", this.settingsFile, extensions);

            const allAdditionalArgs = [...intermediateResultsArgs, ...(additionalArgs || [])];

            const args = commandBuilder.buildArgs(allAdditionalArgs);

            // Step 5: Execute the process using SpawnedProcessStreaming
            this.outputChannel.appendInfoLine(
                resolveI18nTemplate("PQSdk.testAdapter.executor.executingCommand", {
                    exePath: this.pqTestPath,
                    args: args.join(" "),
                }),
            );

            const processRunner = new SpawnedProcessStreaming(this.pqTestPath, args, {
                cwd: workingDirectory,
                outputChannel: this.outputChannel,
                cancellationToken: this.cancellationToken,
            });

            const resultsStream = await processRunner.run();

            // Step 6: Create the result parser and updater
            const resultParser = new PqTestResultParser(this.outputChannel);
            const resultUpdater = new TestResultUpdater(this.testRun, this.outputChannel);

            // Step 7: Implement the state machine
            // Consume the event stream from the parser
            for await (const event of resultParser.parseStream(resultsStream, this.cancellationToken)) {
                let currentTest: vscode.TestItem | undefined = undefined;

                // Handle cancellation
                if (event.type === PqTestResultEventType.Cancelled) {
                    this.outputChannel.appendInfoLine(
                        extensionI18n["PQSdk.testAdapter.executor.testRunCancelledByUser"],
                    );

                    this.state = ExecutionState.Cancelled;
                    break;
                }

                // Handle structured events
                if (event.type === PqTestResultEventType.RunStart) {
                    const testFiles = event.tests;
                    let unexpectedTestCount = 0;

                    testFiles.forEach((filePath: string) => {
                        const normalizedPath = getNormalizedPath(filePath);
                        const test = runItemsMap.get(normalizedPath);

                        if (test) {
                            resultUpdater.enqueueTest(test);
                        } else {
                            // Log the unexpected test and continue with other tests
                            unexpectedTestCount++;

                            this.outputChannel.appendInfoLine(
                                resolveI18nTemplate("PQSdk.testAdapter.executor.unexpectedTest", {
                                    filePath,
                                }),
                            );

                            this.outputChannel.appendDebugLine(`Settings file: ${this.settingsFile.fsPath}`);
                        }
                    });

                    // Show warning to user if there were unexpected tests
                    if (unexpectedTestCount > 0) {
                        const message = resolveI18nTemplate("PQSdk.testAdapter.executor.unexpectedTestCount", {
                            count: unexpectedTestCount.toString(),
                        });

                        vscode.window.showWarningMessage(message);
                    }
                } else if (event.type === PqTestResultEventType.TestStart) {
                    const testKey: string = getNormalizedPath(event.filePath);
                    currentTest = runItemsMap.get(testKey);

                    if (currentTest) {
                        resultUpdater.markTestAsStarted(currentTest);
                    }
                } else if (event.type === PqTestResultEventType.TestEnd) {
                    const testKey: string = getNormalizedPath(event.result.filePath);
                    currentTest = runItemsMap.get(testKey);

                    if (!currentTest) {
                        // TODO: we couldn't find a matching test item - what should we do?
                        continue;
                    }

                    await resultUpdater.updateTestResult(currentTest, event.result);
                } else if (event.type === PqTestResultEventType.RunEnd) {
                    // Run has completed successfully
                    this.outputChannel.appendLine(
                        resolveI18nTemplate("PQSdk.testAdapter.parser.runCompleted", {
                            passed: event.passed.toString(),
                            failed: event.failed.toString(),
                        }),
                    );

                    this.state = ExecutionState.Completed;
                    break;
                }

                if ("originalLine" in event) {
                    resultUpdater.appendOutput(event.originalLine, currentTest);
                }
            }

            this.outputChannel.appendInfoLine(
                extensionI18n["PQSdk.testAdapter.executor.testExecutionCompletedSuccessfully"],
            );
        } catch (error) {
            this.outputChannel.appendErrorLine(extensionI18n["PQSdk.testAdapter.executor.errorDuringTestExecution"]);

            this.outputChannel.appendErrorLine(
                resolveI18nTemplate("PQSdk.testAdapter.executor.errorDetails", {
                    errorMessage: error instanceof Error ? error.message : String(error),
                }),
            );

            // Handle exceptions and show user-friendly error messages
            if (error instanceof Error) {
                vscode.window.showErrorMessage(
                    resolveI18nTemplate("PQSdk.testAdapter.executor.errorRunningTests", {
                        errorMessage: error.message,
                    }),
                );

                // Mark all test items as errored
                const errorMsg = error.message;

                this.testItems.forEach(item => {
                    const errorMessage = new vscode.TestMessage(errorMsg);
                    this.testRun.errored(item, errorMessage);
                });
            } else {
                vscode.window.showErrorMessage(
                    extensionI18n["PQSdk.testAdapter.executor.unknownErrorOccurredWhileRunningTests"],
                );

                // Mark all test items as errored with generic message
                this.testItems.forEach(item => {
                    const errorMessage = new vscode.TestMessage(
                        extensionI18n["PQSdk.testAdapter.executor.unknownErrorOccurred"],
                    );

                    this.testRun.errored(item, errorMessage);
                });
            }

            throw error; // Re-throw to allow caller to handle if needed
        }
    }
}

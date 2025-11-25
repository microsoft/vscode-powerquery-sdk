/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as readline from "readline";
import * as vscode from "vscode";

import { PqSdkOutputChannel } from "../../../../features/PqSdkOutputChannel";
import { extensionI18n, resolveI18nTemplate } from "../../../../i18n/extension";
import { getNormalizedPath } from "../../utils/pathUtils";

/**
 * Test execution status from PQTest.exe output.
 */
export enum TestStatus {
    Passed = "Passed",
    Failed = "Failed",
    Error = "Error",
}

/**
 * Maps diagnostic channel names to their corresponding file paths.
 * Key: Channel name (e.g., "adbc", "odbc")
 * Value: File path to the diagnostic output file
 */
export type DiagnosticsChannelPaths = Record<string, string>;

/**
 * Structured test result information.
 */
export interface TestResult {
    filePath: string;
    status: TestStatus;
    durationMs: number;
    errorMessage?: string;
    reason?: string;
    actualTestResultFilePath?: string;
    expectedTestResultFilePath?: string;
    actualDiagnosticsFilePaths?: DiagnosticsChannelPaths;
    expectedDiagnosticsFilePaths?: DiagnosticsChannelPaths;
    error?: {
        message: string;
        details?: any;
    };
}

/**
 * Event types emitted by the parser as it processes the stream.
 */
export enum PqTestResultEventType {
    RunStart = "runStart",
    TestStart = "testStart",
    TestEnd = "testEnd",
    RunEnd = "runEnd",
    Cancelled = "cancelled",
    Error = "error",
}

/**
 * All possible events from the parser.
 */
export type PqTestResultEvent =
    | { type: PqTestResultEventType.RunStart; tests: string[]; originalLine: string }
    | { type: PqTestResultEventType.TestStart; filePath: string; originalLine: string }
    | { type: PqTestResultEventType.TestEnd; result: TestResult; originalLine: string }
    | { type: PqTestResultEventType.RunEnd; passed: number; failed: number; originalLine: string }
    | { type: PqTestResultEventType.Cancelled }
    | { type: PqTestResultEventType.Error; message: string };

/**
 * Parses the streaming output from PQTest.exe and converts it into structured events.
 * Uses an async generator pattern to yield events as they are parsed from the stream.
 */
export class PqTestResultParser {
    constructor(private outputChannel: PqSdkOutputChannel) {}

    /**
     * @param resultsStream - The readable stream from PQTest.exe stdout
     * @param token - Cancellation token for stopping the parser
     * @yields PqTestResultEvent - Structured events representing test execution progress
     */
    async *parseStream(
        resultsStream: NodeJS.ReadableStream,
        token: vscode.CancellationToken
    ): AsyncGenerator<PqTestResultEvent> {
        this.outputChannel.appendLine(extensionI18n["PQSdk.testAdapter.parser.startingToParse"]);

        const lineReader = readline.createInterface({
            input: resultsStream,
            crlfDelay: Infinity,
        });

        for await (const line of lineReader) {
            // Check for cancellation
            if (token.isCancellationRequested) {
                this.outputChannel.appendLine(extensionI18n["PQSdk.testAdapter.parser.cancelled"]);
                yield { type: PqTestResultEventType.Cancelled };
                return;
            }

            // Log the line
            this.outputChannel.appendLine(line.trim());

            // Skip empty lines
            if (line.trim().length === 0) {
                continue;
            }

            // Parse line format: "action:jsonData"
            const colonIndex = line.indexOf(":");
            if (colonIndex === -1) {
                const errorMsg = resolveI18nTemplate("PQSdk.testAdapter.parser.unexpectedLineFormat", {
                    line,
                });
                this.outputChannel.appendErrorLine(errorMsg);
                throw new Error(errorMsg);
            }

            const action = line.substring(0, colonIndex);
            const detailString = line.substring(colonIndex + 1);

            try {
                // Parse based on action type
                if (action === PqTestResultEventType.RunStart) {
                    const event = JSON.parse(detailString) as RunStartEvent;
                    yield {
                        type: PqTestResultEventType.RunStart,
                        tests: event.tests,
                        originalLine: line,
                    };
                } else if (action === PqTestResultEventType.TestStart) {
                    const event = JSON.parse(detailString) as TestStartEvent;
                    yield {
                        type: PqTestResultEventType.TestStart,
                        filePath: event.filePath,
                        originalLine: line,
                    };
                } else if (action === PqTestResultEventType.TestEnd) {
                    const event = JSON.parse(detailString) as TestEndEvent;
                    const testResult: TestResult = {
                        filePath: getNormalizedPath(event.filePath),
                        status: event.status,
                        durationMs: event.durationTotalSeconds * 1000,
                        reason: event.reason,
                        actualTestResultFilePath: event.actualTestResultFilePath,
                        expectedTestResultFilePath: event.expectedTestResultFilePath,
                        actualDiagnosticsFilePaths: event.actualDiagnosticsFilePaths,
                        expectedDiagnosticsFilePaths: event.expectedDiagnosticsFilePaths,
                        error: event.error,
                    };
                    yield {
                        type: PqTestResultEventType.TestEnd,
                        result: testResult,
                        originalLine: line,
                    };
                } else if (action === PqTestResultEventType.RunEnd) {
                    const event = JSON.parse(detailString) as RunEndEvent;
                    this.outputChannel.appendLine(
                        resolveI18nTemplate("PQSdk.testAdapter.parser.runCompleted", {
                            passed: event.passed.toString(),
                            failed: event.failed.toString(),
                        })
                    );
                    yield {
                        type: PqTestResultEventType.RunEnd,
                        passed: event.passed,
                        failed: event.failed,
                        originalLine: line,
                    };
                    return; // End of stream
                } else {
                    const errorMsg = resolveI18nTemplate("PQSdk.testAdapter.parser.unexpectedAction", {
                        action,
                    });
                    this.outputChannel.appendErrorLine(errorMsg);
                    throw new Error(errorMsg);
                }
            } catch (e) {
                const errorMsg = resolveI18nTemplate("PQSdk.testAdapter.parser.errorParsingEvent", {
                    action,
                    detailString,
                    error: e instanceof Error ? e.message : String(e),
                });
                this.outputChannel.appendErrorLine(errorMsg);
                throw new Error(errorMsg);
            }
        }

        this.outputChannel.appendLine(extensionI18n["PQSdk.testAdapter.parser.finishedParsing"]);
    }
}

// Internal interfaces for parsing JSON events from PQTest.exe
interface RunStartEvent {
    tests: string[];
    timestamp: string;
}

interface TestStartEvent {
    filePath: string;
    timestamp: string;
}

interface TestEndEvent {
    filePath: string;
    status: TestStatus;
    durationTotalSeconds: number;
    timestamp: string;
    error?: {
        message: string;
        details?: any;
    };
    reason?: string;
    actualTestResultFilePath?: string;
    expectedTestResultFilePath?: string;
    actualDiagnosticsFilePaths?: DiagnosticsChannelPaths;
    expectedDiagnosticsFilePaths?: DiagnosticsChannelPaths;
}

interface RunEndEvent {
    passed: number;
    failed: number;
    timestamp: string;
}

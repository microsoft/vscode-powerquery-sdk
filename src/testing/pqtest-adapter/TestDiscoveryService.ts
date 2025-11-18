/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as vscode from "vscode";

import { ExtensionConfigurations } from "../../constants/PowerQuerySdkConfiguration";
import { extensionI18n, resolveI18nTemplate } from "../../i18n/extension";
import { PqSdkOutputChannel } from "../../features/PqSdkOutputChannel";
import { PqTestExecutableOnceTask } from "../../pqTestConnector/PqTestExecutableOnceTask";
import { PQTestTask } from "../../common/PowerQueryTask";
import { getTestPathFromSettings } from "./utils/testSettingsUtils";
import { getPathType } from "../../utils/files";
import { resolveSubstitutedValues } from "../../utils/vscodes";

/**
 * Service for discovering tests using PQTest.exe run-compare --listOnly command.
 * Encapsulates the logic for calling pqtest.exe and returning parsed test results.
 */
export class TestDiscoveryService {
    constructor(private outputChannel?: PqSdkOutputChannel) {}

    /**
     * Discovers tests for a given settings file by calling PQTest.exe with --listOnly flag.
     * 
     * @param settingsFileUri - URI to the .testsettings.json file
     * @param token - Optional cancellation token
     * @returns Parsed JSON result from PQTest.exe containing discovered tests
     * @throws Error if discovery fails
     */
    async discoverTests(
        settingsFileUri: vscode.Uri,
        token?: vscode.CancellationToken
    ): Promise<any> {
        if (token?.isCancellationRequested) {
            throw new Error(extensionI18n["PQSdk.testDiscoveryService.testDiscoveryCancelled"]);
        }

        // Get the default extension (connector) path
        const defaultExtension = resolveSubstitutedValues(
            ExtensionConfigurations.DefaultExtensionLocation
        );
        if (!defaultExtension) {
            const error = extensionI18n["PQSdk.testDiscoveryService.defaultExtensionNotConfigured"];
            this.outputChannel?.appendLine(error);
            throw new Error(error);
        }

        // Read the test path from settings file
        let testPath: string;
        try {
            testPath = await getTestPathFromSettings(settingsFileUri.fsPath);
        } catch (err: any) {
            const error = resolveI18nTemplate("PQSdk.testDiscoveryService.failedToReadTestDirectory", {
                settingsFilePath: settingsFileUri.fsPath,
                errorMessage: err.message,
            });
            this.outputChannel?.appendLine(error);
            throw new Error(error);
        }

        // Determine if testPath is a file or directory
        let pathType: "file" | "directory" | "not-found";
        try {
            pathType = await getPathType(testPath);
            if (pathType === "not-found") {
                const error = resolveI18nTemplate("PQSdk.testDiscoveryService.testPathDoesNotExist", {
                    testPath,
                });
                this.outputChannel?.appendLine(error);
                throw new Error(error);
            }
        } catch (err: any) {
            const error = resolveI18nTemplate("PQSdk.testDiscoveryService.failedToCheckTestPathType", {
                errorMessage: err.message,
            });
            this.outputChannel?.appendLine(error);
            throw new Error(error);
        }

        this.outputChannel?.appendLine(
            resolveI18nTemplate("PQSdk.testDiscoveryService.startingTestDiscoveryForPath", {
                pathType,
                testPath,
            })
        );
        this.outputChannel?.appendLine(
            resolveI18nTemplate("PQSdk.testDiscoveryService.usingExtension", {
                defaultExtension,
            })
        );
        this.outputChannel?.appendLine(
            resolveI18nTemplate("PQSdk.testDiscoveryService.usingSettingsFile", {
                settingsFilePath: settingsFileUri.fsPath,
            })
        );

        // Create the PQTest task for run-compare with --listOnly
        const task: PQTestTask = {
            operation: "run-compare",
            pathToConnector: defaultExtension,
            pathToQueryFile: testPath,
            settingsFile: settingsFileUri.fsPath,
            additionalArgs: ["--listOnly"],
        };

        // Execute the task using PqTestExecutableOnceTask
        const taskExecutor = new PqTestExecutableOnceTask();

        try {
            // Subscribe to output events for logging
            taskExecutor.eventBus.on("PqTestExecutable.onOutput", (type, message) => {
                if (type === "stdOutput") {
                    this.outputChannel?.appendLine(
                        resolveI18nTemplate("PQSdk.testDiscoveryService.pqtestOutput", { message })
                    );
                } else if (type === "stdError") {
                    this.outputChannel?.appendLine(
                        resolveI18nTemplate("PQSdk.testDiscoveryService.pqtestError", { message })
                    );
                }
            });

            this.outputChannel?.appendLine(extensionI18n["PQSdk.testDiscoveryService.executingPqTestWithListOnly"]);

            // Run the task and get the parsed JSON result
            const result = await taskExecutor.run(testPath, task);

            if (!result) {
                throw new Error(extensionI18n["PQSdk.testDiscoveryService.pqtestReturnedNoResults"]);
            }

            this.outputChannel?.appendLine(extensionI18n["PQSdk.testDiscoveryService.successfullyDiscoveredTests"]);
            return result;
        } catch (err: any) {
            const error = resolveI18nTemplate("PQSdk.testDiscoveryService.failedToDiscoverTests", {
                errorMessage: err.message,
            });
            this.outputChannel?.appendLine(error);
            throw new Error(error);
        } finally {
            // Clean up the task executor
            taskExecutor.dispose();
        }
    }
}

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as vscode from "vscode";

import { PqSdkOutputChannel } from "../../features/PqSdkOutputChannel";
import { extensionI18n, resolveI18nTemplate } from "../../i18n/extension";
import { resolvePqTestExecutablePath } from "../../utils/pqTestPath";
import { PqTestDiscoveryRunner } from "./helpers/PqTestDiscoveryRunner";
import { determineExtensionsForTests, getTestPathFromSettings } from "./utils/testSettingsUtils";
import { getPathType } from "./utils/vscodeFs";

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
    async discoverTests(settingsFileUri: vscode.Uri, token?: vscode.CancellationToken): Promise<any> {
        if (token?.isCancellationRequested) {
            throw new Error(extensionI18n["PQSdk.testDiscoveryService.testDiscoveryCancelled"]);
        }

        // Determine which extension(s) to use based on precedence rules
        const extensions: string | string[] | undefined = await determineExtensionsForTests(
            settingsFileUri.fsPath,
            this.outputChannel,
        );

        // Get the test path from settings file
        let testPath: string;

        try {
            testPath = await getTestPathFromSettings(settingsFileUri.fsPath);
        } catch (err: any) {
            const error: string = resolveI18nTemplate("PQSdk.testDiscoveryService.failedToReadTestDirectory", {
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
                const error: string = resolveI18nTemplate("PQSdk.testDiscoveryService.testPathDoesNotExist", {
                    testPath,
                });

                this.outputChannel?.appendLine(error);
                throw new Error(error);
            }
        } catch (err: any) {
            const error: string = resolveI18nTemplate("PQSdk.testDiscoveryService.failedToCheckTestPathType", {
                errorMessage: err.message,
            });

            this.outputChannel?.appendLine(error);
            throw new Error(error);
        }

        this.outputChannel?.appendDebugLine(
            resolveI18nTemplate("PQSdk.testDiscoveryService.startingTestDiscoveryForPath", {
                pathType,
                testPath,
            }),
        );

        this.outputChannel?.appendDebugLine(
            resolveI18nTemplate("PQSdk.testDiscoveryService.usingSettingsFile", {
                settingsFilePath: settingsFileUri.fsPath,
            }),
        );

        // Get PQTest executable path
        const pqTestPath: string = resolvePqTestExecutablePath();

        // Execute discovery using PqTestDiscoveryRunner
        const discoveryRunner: PqTestDiscoveryRunner = new PqTestDiscoveryRunner(
            pqTestPath,
            settingsFileUri,
            extensions,
            this.outputChannel,
        );

        try {
            this.outputChannel?.appendDebugLine(
                extensionI18n["PQSdk.testDiscoveryService.executingPqTestWithListOnly"],
            );

            const result: any = await discoveryRunner.runDiscovery();

            if (!result) {
                throw new Error(extensionI18n["PQSdk.testDiscoveryService.pqtestReturnedNoResults"]);
            }

            this.outputChannel?.appendInfoLine(extensionI18n["PQSdk.testDiscoveryService.successfullyDiscoveredTests"]);

            return result;
        } catch (err: any) {
            const error: string = resolveI18nTemplate("PQSdk.testDiscoveryService.failedToDiscoverTests", {
                errorMessage: err.message,
            });

            this.outputChannel?.appendLine(error);
            throw new Error(error);
        }
    }
}

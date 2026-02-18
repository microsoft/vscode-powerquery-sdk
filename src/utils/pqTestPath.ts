/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

/**
 * Utility functions for resolving PQTest.exe executable path.
 */

import * as fs from "fs";
import * as path from "path";

import { ExtensionConfigurations } from "../constants/PowerQuerySdkConfiguration";
import { extensionI18n, resolveI18nTemplate } from "../i18n/extension";

export const PQTEST_EXECUTABLE_NAME: string = "PQTest.exe";

/**
 * Resolves the full path to PQTest.exe executable.
 *
 * Priority order:
 * 1. Direct executable path (powerquery.sdk.test.pqtest)
 * 2. Tools directory + executable name (powerquery.sdk.tools.location)
 *
 * @throws Error if PQTest.exe cannot be found or configured
 * @returns Full path to PQTest.exe
 */
export function resolvePqTestExecutablePath(): string {
    // First check if direct PQTest executable path is configured
    const directExecutablePath: string | undefined = ExtensionConfigurations.pqTestExecutablePath;

    if (directExecutablePath) {
        // Validate that the path ends with PQTest.exe
        if (!directExecutablePath.toLowerCase().endsWith(PQTEST_EXECUTABLE_NAME.toLowerCase())) {
            throw new Error(
                resolveI18nTemplate("PQSdk.taskQueue.error.invalidPqtestExecutablePath", {
                    directExecutablePath,
                    executableName: PQTEST_EXECUTABLE_NAME,
                }),
            );
        }

        // Validate that the file exists
        if (!fs.existsSync(directExecutablePath)) {
            throw new Error(
                resolveI18nTemplate("PQSdk.taskQueue.error.pqtestExecutableNotFoundAtDirectPath", {
                    directExecutablePath,
                }),
            );
        }

        return directExecutablePath;
    }

    // Fall back to tools directory + executable name
    const toolsLocation: string | undefined = ExtensionConfigurations.PQTestLocation;

    if (!toolsLocation) {
        throw new Error(extensionI18n["PQSdk.taskQueue.error.pqtestLocationNotSet"]);
    }

    if (!fs.existsSync(toolsLocation)) {
        throw new Error(
            resolveI18nTemplate("PQSdk.taskQueue.error.pqtestLocationDoesntExist", {
                nextPQTestLocation: toolsLocation,
            }),
        );
    }

    const pqTestPath: string = path.resolve(toolsLocation, PQTEST_EXECUTABLE_NAME);

    if (!fs.existsSync(pqTestPath)) {
        throw new Error(
            resolveI18nTemplate("PQSdk.taskQueue.error.pqtestExecutableDoesntExist", {
                pqtestExe: pqTestPath,
            }),
        );
    }

    return pqTestPath;
}

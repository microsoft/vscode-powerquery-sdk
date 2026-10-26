/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as fs from "fs";
import * as path from "path";

import { ExtensionConstants } from "../constants/PowerQuerySdkExtension";

let localToolsLocation: string | undefined;

export function initializeLocalSdkTools(
    enabled: boolean,
    value: string | undefined = process.env.PQSDK_TEST_TOOLS_PATH,
): void {
    localToolsLocation = undefined;

    if (!enabled || value === undefined) {
        return;
    }

    if (!value.trim() || !path.isAbsolute(value)) {
        throw new Error("PQSDK_TEST_TOOLS_PATH must be an absolute path to an extracted SDK Tools directory.");
    }

    const location: string = path.normalize(value);

    for (const executable of ["PQTest.exe", ExtensionConstants.MakePQXExecutableName]) {
        const executablePath: string = path.join(location, executable);

        if (!fs.statSync(executablePath, { throwIfNoEntry: false })?.isFile()) {
            throw new Error(`PQSDK_TEST_TOOLS_PATH requires ${executablePath}. No NuGet download will be attempted.`);
        }
    }

    localToolsLocation = location;
}

export function getLocalSdkToolsLocation(): string | undefined {
    return localToolsLocation;
}

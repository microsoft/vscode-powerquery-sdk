/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as chai from "chai";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import { extensionDevelopmentPath, NugetBaseFolder, PqTestSubPath } from "./common";
import { delay } from "./utils";

const expect = chai.expect;

const MAX_AWAIT_TIME: number = 2 * 60e3;
const AWAIT_INTERVAL: number = 5e3;

export function buildPqTestAcquisitionTest(): void {
    test("Seize the pqTest from nuget", async () => {
        let i = 0;

        const expectedPqTestExePath = path.resolve(extensionDevelopmentPath, NugetBaseFolder, ...PqTestSubPath);

        while (i < MAX_AWAIT_TIME / AWAIT_INTERVAL) {
            i += 1;
            // eslint-disable-next-line no-await-in-loop
            await delay(AWAIT_INTERVAL);

            if (fs.existsSync(expectedPqTestExePath)) {
                break;
            }
        }

        const manuallySeizedPath: string = await vscode.commands.executeCommand(
            "powerquery.sdk.pqtest.SeizePqTestCommand",
        );

        expect(manuallySeizedPath).eq(path.dirname(expectedPqTestExePath));
    }).timeout(MAX_AWAIT_TIME);
}

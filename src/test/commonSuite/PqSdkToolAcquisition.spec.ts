/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { Workbench } from "vscode-extension-tester";

import { PqSdkNugetPackages } from "../utils";

import { delay } from "../../utils/pids";
import { MAX_AWAIT_TIME } from "../common";

describe("PQSdk Tool Acquisition Test", () => {
    it("Seize the latest by default.", async () => {
        const workbench = new Workbench();

        await PqSdkNugetPackages.assertPqSdkToolExisting();

        await workbench.executeCommand("power query: Update SDK Tool");

        await delay(3e3);

        await PqSdkNugetPackages.assertPqSdkToolExisting();
    }).timeout(MAX_AWAIT_TIME);
});

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as assert from "assert";
import * as vscode from "vscode";

import * as TestUtils from "../TestUtils";

import { LifecycleCommands } from "../../../src/commands/LifecycleCommands";

// import { makeOneTmpDir } from "../../utils/osUtils";

suite("New extension project Tests", () => {
    suiteSetup(TestUtils.activateExtension);

    // const newExtensionName: string = "FirstConn";
    // const oneTmpDir: string | undefined = makeOneTmpDir();

    test("New extension project command exists", async () => {
        await TestUtils.CreateAsyncTestResult(() => {
            assert.ok(
                vscode.commands
                    .getCommands(true)
                    .then(commands => commands.includes(LifecycleCommands.CreateNewProjectCommand)),
                `${LifecycleCommands.CreateNewProjectCommand} command not found`,
            );
        });
    });
});

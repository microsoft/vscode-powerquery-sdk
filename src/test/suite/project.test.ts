/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as assert from "assert";
import * as vscode from "vscode";

import { Commands } from "../TestConstants";
import * as TestUtils from "../TestUtils";

// import { makeOneTmpDir } from "../../utils/osUtils";

suite("New extension project Tests", () => {
    suiteSetup(TestUtils.ensureRequiredExtensionsAreLoaded);

    // const newExtensionName: string = "FirstConn";
    // const oneTmpDir: string | undefined = makeOneTmpDir();

    test("New extension project command exists", async () => {
        const commands = await vscode.commands.getCommands(true);

        assert.ok(
            commands.includes(Commands.CreateNewProjectCommand),
            `${Commands.CreateNewProjectCommand} command not found`,
        );
    });
});

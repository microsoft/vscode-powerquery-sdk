/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */
import * as path from "path";

import { ExTester } from "vscode-extension-tester";
import { getFirstVsixFileDirectlyBeneathOneDirectory } from "./utils/vsixs";

const theVsixFilePath: string = getFirstVsixFileDirectlyBeneathOneDirectory(process.cwd());

async function doE2eTest() {
    const extTest = new ExTester();

    // Performs all necessary setup: getting VSCode + ChromeDriver and packaging/installing extension into the test instance
    await extTest.setupRequirements();

    // Install the extension into the test instance of VS Code
    await extTest.installVsix({ vsixFile: path.resolve(process.cwd(), theVsixFilePath) });

    // Runs the selected test files in VS Code using mocha and webdriver
    await extTest.runTests("out/src/test/**/*.spec.js", { cleanup: true });
}

void doE2eTest();

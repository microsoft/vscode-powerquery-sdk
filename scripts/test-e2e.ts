/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */
import * as path from "path";
import * as os from "os";

import { ExTester } from "vscode-extension-tester";
import { getFirstVsixFileDirectlyBeneathOneDirectory } from "./utils/vsixs";

const theVsixFilePath: string = getFirstVsixFileDirectlyBeneathOneDirectory(process.cwd());

// v5.10.0 selects the CWD rather than TMPDIR as test-resources folder, so we'll set it explicitly.
const testerResourceFolder:string = path.resolve(os.tmpdir(), "test-resources");

async function doE2eTest() {
    const extTest = new ExTester(testerResourceFolder);

    // Performs all necessary setup: getting VSCode + ChromeDriver into the test instance
    await extTest.downloadCode();
    await extTest.downloadChromeDriver();

    // Install the extension into the test instance of VS Code
    await extTest.installVsix({ vsixFile: path.resolve(process.cwd(), theVsixFilePath), installDependencies: true });

    // Runs the selected test files in VS Code using mocha and webdriver
    await extTest.runTests("out/src/test/**/*.spec.js", { cleanup: true, resources: [] });
}

void doE2eTest();

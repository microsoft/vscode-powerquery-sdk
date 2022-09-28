/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { ExTester } from "vscode-extension-tester";
import { getFirstVsixFileDirectlyBeneathOneDirectory } from "./utils/vsixs";

const theVsixFilePath: string = getFirstVsixFileDirectlyBeneathOneDirectory(process.cwd());

async function doE2eTest() {
    const extTest = new ExTester();

    await extTest.installVsix({ vsixFile: theVsixFilePath });

    await extTest.runTests("out/src/test/**/*.spec.js", { cleanup: true });
}

void doE2eTest();

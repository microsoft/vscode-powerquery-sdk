/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as cp from "child_process";
import { getFirstVsixFileDirectlyBeneathOneDirectory } from "./utils/vsixs";

const cwd = process.cwd();

let oneVsixFile: string = getFirstVsixFileDirectlyBeneathOneDirectory(process.cwd());

if (oneVsixFile) {
    cp.execSync(`code --install-extension ${oneVsixFile}`, { cwd });
} else {
    console.error('Cannot find one vsix file, please run "npm run vsix" before install.');
}

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as vscode from "vscode";

import { buildPqTestAcquisitionTest } from "./PqTestAcquisitionTest";
import { extensionId } from "./common";
// import * as extension from "../../extension";

suite("Extension Test Suite", () => {
    vscode.extensions.getExtension(extensionId);

    vscode.window.showInformationMessage("Start all Pq SDK tests.");

    buildPqTestAcquisitionTest();
});

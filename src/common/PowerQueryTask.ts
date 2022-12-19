/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as vscode from "vscode";
import { OperationType } from "./OperationType";

// Properties that need to be persisted as part of the task definition should be
// included in the taskDefinitions section of package.json.

export interface PowerQueryTask {
    readonly operation: OperationType;
    readonly additionalArgs?: string[];
    readonly label?: string;
}

export interface PQTestTask extends PowerQueryTask {
    // TODO: Are we using "Connector" or "Extension" terminology?
    readonly pathToConnector?: string;
    readonly pathToQueryFile?: string;
    readonly stdinStr?: string;
    readonly credentialTemplate?: object;
}

export interface PowerQueryTaskDefinition extends PQTestTask, vscode.TaskDefinition {}

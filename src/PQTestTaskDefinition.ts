// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from "vscode";

// Properties that need to be persisted as part of the task definition should be
// included in the taskDefinitions section of package.json.
// TODO: Are we using "Connector" or "Extension" terminology?
export interface PQTestTaskDefinition extends vscode.TaskDefinition {
    readonly operation: string;

    readonly additionalArgs?: string[];
    readonly label?: string;
    readonly pathToConnector?: string;
    readonly pathToQueryFile?: string;
}

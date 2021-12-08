// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from "vscode";

export const PowerQueryTaskProviderName: string = "powerquery";

// Properties that need to be persisted as part of the task definition should be
// included in the taskDefinitions section of package.json.
// TODO: Are we using "Connector" or "Extension" terminology?
export interface PQTestTaskDefinition extends vscode.TaskDefinition {
    readonly operation: string;
    readonly includePathToConnector: boolean;
    readonly includePathToQueryFile: boolean;
    readonly additionalArgs?: string[];
    readonly label?: string;
    pathToConnector?: string;
    pathToQueryFile?: string;
}

export class SimpleTaskDefinition implements PQTestTaskDefinition {
    public readonly type: string = PowerQueryTaskProviderName;
    public readonly operation: string;
    public readonly label: string;
    public readonly additionalArgs?: string[] | undefined;

    constructor(operation: string, label: string, additionalArgs?: string[]) {
        this.operation = operation;
        this.additionalArgs = additionalArgs;
        this.label = label;
    }

    public get includePathToConnector(): boolean {
        return false;
    }

    public get includePathToQueryFile(): boolean {
        return false;
    }
}

export class ConnectorTaskDefinition extends SimpleTaskDefinition {
    private _pathToConnector: string | undefined;

    constructor(operation: string, label: string, additionalArgs?: string[]) {
        super(operation, label, additionalArgs);
    }

    public override get includePathToConnector(): boolean {
        return true;
    }

    public get pathToConnector(): string | undefined {
        return this._pathToConnector;
    }

    public set pathToConnector(path: string | undefined) {
        this._pathToConnector = path;
    }
}

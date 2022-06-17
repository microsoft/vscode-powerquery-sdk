/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as vscode from "vscode";

export interface GenericResult {
    readonly Status: "Success" | "Failure";
    readonly Message: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly Details: any;
}

export type AuthenticationKind = "Anonymous" | "Key" | "Aad" | "OAuth2" | "UsernamePassword" | "Windows";

export interface PQTestTaskBase {
    readonly operation: string;
    readonly additionalArgs?: string[];
    readonly pathToConnector?: string;
    readonly pathToQueryFile?: string;
    readonly stdinStr?: string;
}

// Properties that need to be persisted as part of the task definition should be
// included in the taskDefinitions section of package.json.
// TODO: Are we using "Connector" or "Extension" terminology?
export interface PQTestTaskDefinition extends PQTestTaskBase, vscode.TaskDefinition {
    readonly label?: string;
}

export interface IPQTestService {
    readonly pqTestReady: boolean;
    readonly pqTestLocation: string;
    readonly pqTestFullPath: string;
    readonly onPowerQueryTestLocationChanged: () => void;
    readonly DeleteCredential: () => Promise<GenericResult>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly DisplayExtensionInfo: () => Promise<any>;
    // todo need to settle the credential types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly ListCredentials: () => Promise<any[]>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly GenerateCredentialTemplate: () => Promise<any>;
    readonly SetCredential: (payloadStr: string) => Promise<GenericResult>;
    readonly RefreshCredential: () => Promise<GenericResult>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly RunTestBattery: (pathToQueryFile?: string) => Promise<any>;
    readonly TestConnection: () => Promise<GenericResult>;
}

const CommonArgs: string[] = ["--prettyPrint"];

export function buildPqTestArgs(pqTestTaskBase: PQTestTaskBase): string[] {
    const args: string[] = CommonArgs.slice();

    if (pqTestTaskBase.additionalArgs) {
        args.push(...pqTestTaskBase.additionalArgs);
    }

    if (pqTestTaskBase.pathToQueryFile) {
        args.unshift(pqTestTaskBase.pathToQueryFile);
        args.unshift("--queryFile");
    }

    if (pqTestTaskBase.pathToConnector) {
        args.unshift(pqTestTaskBase.pathToConnector);
        args.unshift("--extension");
    }

    args.unshift(pqTestTaskBase.operation);

    return args;
}

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { PQTestTask } from "./PowerQueryTask";

export interface GenericResult {
    readonly Status: "Success" | "Failure";
    readonly Message: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly Details: any;
}

export type AuthenticationKind = "Anonymous" | "Key" | "Aad" | "OAuth2" | "UsernamePassword" | "Windows";

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

export function buildPqTestArgs(pqTestTask: PQTestTask): string[] {
    const args: string[] = CommonArgs.slice();

    if (pqTestTask.additionalArgs) {
        args.push(...pqTestTask.additionalArgs);
    }

    if (pqTestTask.pathToQueryFile) {
        args.unshift(pqTestTask.pathToQueryFile);
        args.unshift("--queryFile");
    }

    if (pqTestTask.pathToConnector) {
        args.unshift(pqTestTask.pathToConnector);
        args.unshift("--extension");
    }

    args.unshift(pqTestTask.operation);

    return args;
}

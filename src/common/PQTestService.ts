/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { PQTestTask } from "common/PowerQueryTask";
import type { ValueEventEmitter } from "common/ValueEventEmitter";

export interface GenericResult {
    readonly Status: "Success" | "Failure";
    readonly Message: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly Details: any;
}

export interface DataSource {
    kind: string;
    path: string;
}

export type AuthenticationKind = "Anonymous" | "Key" | "Aad" | "OAuth2" | "UsernamePassword" | "Windows";

export interface Credential {
    DataSource: DataSource;
    AuthenticationKind: AuthenticationKind | string;
    PrivacySetting: "None" | "Public" | "Organizational" | "Private" | string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Properties: Record<string, any>;
}

export interface ExtensionInfo {
    Source: string;
    LibraryId: string;
    ErrorStatus: string | null;
    Name: string | null;
    Version: string | null;
    Metadata: {
        Version: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [key: string]: any;
    };
    Members: Array<{
        Name: string;
        Type: string;
        DataSourceKind: string;
        Publish: {
            Beta?: boolean;
            Category: string;
            SupportsDirectQuery?: boolean;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            [key: string]: any;
        };
        Documentation?: {
            Description?: string;
            LongDescription?: string;
            Category?: string;
        };
        FunctionParameters: Array<{
            Name: string;
            ParameterType: string;
            IsRequired: boolean;
            IsNullable: boolean;
            Caption: boolean;
            Description?: string;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            SampleValues?: Array<any>;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            AllowedValues?: Array<any>;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            DefaultValue?: any;
            Fields?: Array<{
                FiledName: string;
                Type: string;
                IsRequired?: string;
                FieldCaption?: string;
                FieldDescription?: string;
            }>;
            EnumNames?: Array<string>;
            EnumCaptions?: Array<string>;
        }>;
        CompletionItemType: number;
        IsDataSource: boolean;
        DataTypeOrReturnType: string;
    }>;
    DataSources: Array<{
        DataSourceKind: string;
        AuthenticationInfos: Array<{
            Kind: string;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            Properties: Array<any>;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ApplicationProperties: Array<any>;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            [key: string]: any;
        }>;
    }>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
}

export interface CreateAuthState {
    DataSourceKind: string;
    AuthenticationKind: string;
    PathToQueryFile: string;
    // for the key template
    $$KEY$$?: string;
    // for the username password template
    $$USERNAME$$?: string;
    $$PASSWORD$$?: string;
}

export interface IPQTestService {
    readonly pqTestReady: boolean;
    readonly pqTestLocation: string;
    readonly pqTestFullPath: string;
    readonly currentExtensionInfos: ValueEventEmitter<ExtensionInfo[]>;
    readonly currentCredentials: ValueEventEmitter<Credential[]>;
    readonly onPowerQueryTestLocationChanged: () => void;
    readonly DeleteCredential: () => Promise<GenericResult>;
    readonly DisplayExtensionInfo: () => Promise<ExtensionInfo>;
    readonly ListCredentials: () => Promise<Credential[]>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly GenerateCredentialTemplate: () => Promise<any>;
    readonly SetCredential: (payloadStr: string) => Promise<GenericResult>;
    readonly SetCredentialFromCreateAuthState: (createAuthState: CreateAuthState) => Promise<GenericResult>;
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

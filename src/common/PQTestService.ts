/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as PQLSExt from "./vscode-powerquery.api.d";

import { PQTestTask } from "./PowerQueryTask";
import type { ValueEventEmitter } from "./ValueEventEmitter";

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

export type AuthenticationKind = "Anonymous" | "Key" | "Aad" | "OAuth" | "UsernamePassword" | "Windows";

export interface Credential {
    DataSource: DataSource;
    AuthenticationKind: AuthenticationKind | string;
    PrivacySetting: "None" | "Public" | "Organizational" | "Private" | string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Properties: Record<string, any>;
}

export interface FunctionParametersField {
    FiledName: string;
    Type: string;
    IsRequired?: string;
    FieldCaption?: string;
    FieldDescription?: string;
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
    Members: ReadonlyArray<{
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
        FunctionParameters?: ReadonlyArray<{
            Name: string;
            ParameterType: string;
            IsRequired: boolean;
            IsNullable: boolean;
            Caption?: string;
            Description?: string;
            SampleValues?: ReadonlyArray<string | number>;
            AllowedValues?: ReadonlyArray<string | number>;
            DefaultValue?: string | number;
            Fields?: Array<FunctionParametersField>;
            EnumNames?: ReadonlyArray<string>;
            EnumCaptions?: ReadonlyArray<string | null>;
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
    PathToConnectorFile?: string;
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
    readonly ExecuteBuildTaskAndAwaitIfNeeded: () => Promise<void>;
    readonly DeleteCredential: () => Promise<GenericResult>;
    readonly DisplayExtensionInfo: () => Promise<ExtensionInfo[]>;
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

export function convertExtensionInfoToLibraryJson(extensionInfos: ExtensionInfo[]): PQLSExt.LibraryJson {
    const libraryExports: PQLSExt.LibraryExportJson[] = [];

    for (const oneInfo of extensionInfos) {
        if (oneInfo.Members && Array.isArray(oneInfo.Members)) {
            for (const oneInfoMember of oneInfo.Members) {
                // TODO: language extension expects a single member rather than an array.
                // if (oneInfoMember.Documentation && Array.isArray(oneInfoMember.Documentation)) {
                //     one.documentation = [];

                //     for (const oneInfoMemberDoc of oneInfoMember.Documentation) {
                //         one.documentation.push({
                //             description: oneInfoMemberDoc.Description ?? null,
                //             longDescription: oneInfoMemberDoc.LongDescription ?? null,
                //         });
                //     }
                // } else {
                //     one.documentation = null;
                // }

                const functionParameters: PQLSExt.LibraryFunctionParameterJson[] = [];

                if (oneInfoMember.FunctionParameters && Array.isArray(oneInfoMember.FunctionParameters)) {
                    for (const oneInfoMemberPara of oneInfoMember.FunctionParameters) {
                        functionParameters.push({
                            name: oneInfoMemberPara.Name,
                            type: oneInfoMemberPara.ParameterType,
                            isRequired: oneInfoMemberPara.IsRequired,
                            isNullable: oneInfoMemberPara.IsNullable,
                            caption: oneInfoMemberPara.Caption ?? null,
                            description: oneInfoMemberPara.Description ?? null,
                            sampleValues: oneInfoMemberPara.SampleValues ?? null,
                            allowedValues: oneInfoMemberPara.AllowedValues ?? null,
                            defaultValue: oneInfoMemberPara.DefaultValue ?? null,
                            fields:
                                oneInfoMemberPara.Fields && Array.isArray(oneInfoMemberPara.Fields)
                                    ? oneInfoMemberPara.Fields.map(
                                          (oneInfoMemberParaField: FunctionParametersField) => ({
                                              fieldName: oneInfoMemberParaField.FiledName,
                                              type: oneInfoMemberParaField.Type,
                                              isRequired: Boolean(oneInfoMemberParaField.IsRequired),
                                              fieldCaption: oneInfoMemberParaField.FieldCaption ?? null,
                                              fieldDescription: oneInfoMemberParaField.FieldDescription ?? null,
                                          }),
                                      )
                                    : null,
                            enumNames: oneInfoMemberPara.EnumNames ?? null,
                            enumCaptions: oneInfoMemberPara.EnumCaptions ?? null,
                        });
                    }
                }

                const one: PQLSExt.LibraryExportJson = {
                    name: oneInfoMember.Name,
                    documentation: null,
                    completionItemKind: oneInfoMember.CompletionItemType,
                    functionParameters: functionParameters.length > 0 ? functionParameters : null,
                    isDataSource: oneInfoMember.IsDataSource,
                    type: oneInfoMember.DataTypeOrReturnType,
                };

                libraryExports.push(one);
            }
        }
    }

    return libraryExports;
}

export function buildPqTestArgs(pqTestTask: PQTestTask): string[] {
    let args: string[] = CommonArgs.slice();

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

    if (pqTestTask.operation === "compile") {
        // remove --prettyPrint for compile task
        args = args.filter((arg: string) => arg !== "--prettyPrint");
    }

    return args;
}

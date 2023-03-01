/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { PQTestTask } from "./PowerQueryTask";
import { RpcRequestParamBase } from "../pqTestConnector/RpcClient";
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

export interface ParsedDocumentState {
    DocumentKind: "Section" | "Expression";
    Queries: Array<{
        nameIdentifier: {
            argumentFragmentKind:
                | "Date"
                | "DateTime"
                | "DateTimeZone"
                | "Duration"
                | "FieldAccess"
                | "Identifier"
                | "Logical"
                | "NaN"
                | "NegativeInfinity"
                | "Null"
                | "Number"
                | "PositiveInfinity"
                | "Text"
                | "Time";
            fragmentKind:
                | "Aggregation"
                | "ArbitrarySubstring"
                | "Argument"
                | "ArgumentRecord"
                | "ArithmeticBinaryTransform"
                | "ArithmeticFunctionTransform"
                | "BinaryContents"
                | "BoundarySubstring"
                | string;
            Name: string;
            value: string;
        };
        queryScript: string;
        steps: unknown[];
    }>;
    Errors: Array<{
        Kind: unknown;
        Location: unknown;
        ErrorRange: unknown;
        Message: string;
    }>;
}

export interface ResolveResourceChallengeState {
    DocumentScript: string;
    QueryName?: string;
    ResourceKind?: string;
    ResourcePath?: string;
}

export interface GetPreviewRequest {
    DocumentScript: string;
    QueryName?: string;
}

export interface IPQTestService {
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

export interface PqServiceHostRequestParamBase extends RpcRequestParamBase {
    ExtensionPaths?: string[];
    KeyVaultSecretName?: string;
    DataSourceKind?: string;
    DataSourcePath?: string;
    PrettyPrint?: boolean;
    EnvironmentConfigurationFile?: string;
    EnvironmentSetting?: string[];
    ApplicationPropertyFile?: string;
    ApplicationProperties?: string[];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
}

export interface PqServiceHostCreateAuthRequest extends PqServiceHostRequestParamBase {
    AuthenticationKind: string;
    TemplateValueKey?: string;
    TemplateValueUsername?: string;
    TemplateValuePassword?: string;
    TemplateValueAccessToken?: string;
    TemplateValueRefreshToken?: string;
    AllowUserInteraction?: string;
}

export interface PqServiceHostDeleteCredentialRequest extends PqServiceHostRequestParamBase {
    AllCredentials?: boolean;
}

export interface PqServiceHostRunTestRequest extends PqServiceHostRequestParamBase {
    LogMashupEngineTraceLevel?: string;
    FailOnFoldingFailure?: boolean;
    AutomaticFileCredentials?: boolean;
    RunAsAction?: boolean;
}

export interface PqServiceHostRunTestRequest extends PqServiceHostRequestParamBase {
    LogMashupEngineTraceLevel?: string;
    FailOnFoldingFailure?: boolean;
    AutomaticFileCredentials?: boolean;
    RunAsAction?: boolean;
}

export interface PqServiceHostSetCredentialRequest extends PqServiceHostRequestParamBase {
    AuthenticationKind?: string;
    AllowUserInteraction?: boolean;
    UseLegacyBrowser?: boolean;
    UseSystemBrowser?: boolean;
    InputTemplateString?: string;
}

export interface PqServiceHostTestConnectionRequest extends PqServiceHostRequestParamBase {
    LogMashupEngineTraceLevel?: string;
}

export interface PqServiceHostValidateRequest extends PqServiceHostRequestParamBase {
    LogMashupEngineTraceLevel?: string;
}

export type PqServiceHostResolveResourceChallengeRequest = PqServiceHostRequestParamBase &
    ResolveResourceChallengeState;

export type PqServiceHostGetPreviewRequest = PqServiceHostRequestParamBase & GetPreviewRequest;

export interface IHealthService {
    readonly ForceShutdown: () => Promise<number>;
    readonly Ping: () => Promise<number>;
}

export interface IDocumentService {
    readonly TryParseDocumentScript: (documentScript: string) => Promise<ParsedDocumentState>;
}

export interface IEvaluationService {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly GetPreviewAsync: (state: GetPreviewRequest) => Promise<any>;
}

export interface IPQTestClient {
    readonly pqTestReady: boolean;
    readonly pqTestLocation: string;
    readonly pqTestFullPath: string;
    readonly currentExtensionInfos: ValueEventEmitter<ExtensionInfo[]>;
    readonly currentCredentials: ValueEventEmitter<Credential[]>;
    readonly onPowerQueryTestLocationChangedByConfig: (config: { PQTestLocation: string | undefined }) => void;
    readonly ExecuteBuildTaskAndAwaitIfNeeded: () => Promise<void>;
    readonly pqTestService: IPQTestService;
}

export interface IPQServiceHostClient extends IPQTestClient {
    readonly healthService: IHealthService;
    readonly pqTestService: IPQTestService & {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        readonly RunTestBatteryFromContent: (pathToQueryFile?: string) => Promise<any>;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        readonly ResolveResourceChallengeAsync: (state: ResolveResourceChallengeState) => Promise<any>;
    };
    readonly documentService: IDocumentService;
    readonly evaluationService: IEvaluationService;
}

const CommonArgs: string[] = ["--prettyPrint"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function convertExtensionInfoToLibraryJson(extensionInfos: ExtensionInfo[]): any[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any[] = [];

    for (const oneInfo of extensionInfos) {
        if (oneInfo.Members && Array.isArray(oneInfo.Members)) {
            for (const oneInfoMemeber of oneInfo.Members) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const one: any = {};

                one.name = oneInfoMemeber.Name;
                one.completionItemType = oneInfoMemeber.CompletionItemType;
                one.isDataSource = oneInfoMemeber.IsDataSource;
                one.dataType = oneInfoMemeber.DataTypeOrReturnType;

                if (oneInfoMemeber.Documentation && Array.isArray(oneInfoMemeber.Documentation)) {
                    one.documentation = [];

                    for (const oneInfoMemberDoc of oneInfoMemeber.Documentation) {
                        one.documentation.push({
                            description: oneInfoMemberDoc.Description ?? null,
                            longDescription: oneInfoMemberDoc.LongDescription ?? null,
                            category: oneInfoMemberDoc.Category ?? null,
                        });
                    }
                } else {
                    one.documentation = null;
                }

                if (oneInfoMemeber.FunctionParameters && Array.isArray(oneInfoMemeber.FunctionParameters)) {
                    one.functionParameters = [];

                    for (const oneInfoMemberPara of oneInfoMemeber.FunctionParameters) {
                        one.functionParameters.push({
                            name: oneInfoMemberPara.Name,
                            parameterType: oneInfoMemberPara.ParameterType,
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
                } else {
                    one.functionParameters = null;
                }

                result.push(one);
            }
        }
    }

    return result;
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

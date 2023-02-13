/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as fs from "fs";
import * as vscode from "vscode";

import { TextEditor } from "vscode";

import {
    CreateAuthState,
    GetPreviewRequest,
    IDocumentService,
    IEvaluationService,
    IHealthService,
    IPQServiceHostClient,
    PqServiceHostCreateAuthRequest,
    PqServiceHostDeleteCredentialRequest,
    PqServiceHostGetPreviewRequest,
    PqServiceHostResolveResourceChallengeRequest,
    PqServiceHostRunTestRequest,
    PqServiceHostSetCredentialRequest,
    PqServiceHostTestConnectionRequest,
    ResolveResourceChallengeState,
} from "../common/PQTestService";
import { getFirstWorkspaceFolder, resolveSubstitutedValues } from "../utils/vscodes";
import { executeBuildTaskAndAwaitIfNeeded } from "./PqTestTaskUtils";
import { ExtensionConfigurations } from "../constants/PowerQuerySdkConfiguration";
import { PqSdkOutputChannelLight } from "../features/PqSdkOutputChannel";
import { RpcClient } from "./RpcClient";

type OmittedPqTestMethods = "currentExtensionInfos" | "currentCredentials";

export class PqServiceHostClientLite extends RpcClient implements Omit<IPQServiceHostClient, OmittedPqTestMethods> {
    protected readonly sessionId: string = vscode.env.sessionId;

    constructor(outputChannel: PqSdkOutputChannelLight) {
        super(outputChannel);
    }

    /**
     * Synchronized post-connection event
     * @protected
     */
    protected override onConnected(): void {
        super.onConnected();
        // noop
    }

    /**
     * Synchronized pre-disconnection event
     * @protected
     */
    protected override onDisconnecting(): void {
        super.onDisconnecting();
        // noop
    }

    /**
     * Synchronized pre-reconnection event
     * @protected
     */
    protected override onReconnecting(): void {
        super.onReconnecting();
        // noop
    }

    ExecuteBuildTaskAndAwaitIfNeeded(): Promise<void> {
        return executeBuildTaskAndAwaitIfNeeded(
            this.pqTestLocation,
            this.lastPqRelatedFileTouchedDate,
            (nextLastPqRelatedFileTouchedDate: Date) => {
                this.lastPqRelatedFileTouchedDate = nextLastPqRelatedFileTouchedDate;
            },
        );
    }

    public readonly pqTestService: IPQServiceHostClient["pqTestService"] = {
        DeleteCredential: () =>
            this.requestRemoteRpcMethod<PqServiceHostDeleteCredentialRequest>("v1/PqTestService/DeleteCredential", [
                {
                    SessionId: this.sessionId,
                    PathToConnector: getFirstWorkspaceFolder()?.uri.fsPath,
                    AllCredentials: true,
                },
            ]),
        DisplayExtensionInfo: () =>
            this.requestRemoteRpcMethod(
                "v1/PqTestService/DisplayExtensionInfo",
                [
                    {
                        SessionId: this.sessionId,
                        PathToConnector: getFirstWorkspaceFolder()?.uri.fsPath,
                    },
                ],
                { shouldParsePayload: true },
            ),
        ListCredentials: () =>
            this.requestRemoteRpcMethod("v1/PqTestService/ListCredentials", [
                {
                    SessionId: this.sessionId,
                },
            ]),
        GenerateCredentialTemplate: () =>
            this.requestRemoteRpcMethod(
                "v1/PqTestService/GenerateCredentialTemplate",
                [
                    {
                        SessionId: this.sessionId,
                        PathToConnector: getFirstWorkspaceFolder()?.uri.fsPath,
                        PathToQueryFile: resolveSubstitutedValues(ExtensionConfigurations.DefaultQueryFileLocation),
                    },
                ],
                { shouldParsePayload: true },
            ),
        SetCredential: (payloadStr: string) =>
            this.requestRemoteRpcMethod<PqServiceHostSetCredentialRequest>("v1/PqTestService/SetCredential", [
                {
                    SessionId: this.sessionId,
                    PathToConnector: getFirstWorkspaceFolder()?.uri.fsPath,
                    PathToQueryFile: resolveSubstitutedValues(ExtensionConfigurations.DefaultQueryFileLocation),
                    InputTemplateString: payloadStr,
                },
            ]),
        SetCredentialFromCreateAuthState: (createAuthState: CreateAuthState) =>
            this.requestRemoteRpcMethod<PqServiceHostCreateAuthRequest>(
                "v1/PqTestService/SetCredentialFromCreateAuthState",
                [
                    {
                        SessionId: this.sessionId,
                        PathToConnector: createAuthState.PathToConnectorFile || getFirstWorkspaceFolder()?.uri.fsPath,
                        PathToQueryFile: resolveSubstitutedValues(createAuthState.PathToQueryFile),
                        // DataSourceKind: createAuthState.DataSourceKind,
                        AuthenticationKind: createAuthState.AuthenticationKind,
                        TemplateValueKey: createAuthState.$$KEY$$,
                        TemplateValueUsername: createAuthState.$$USERNAME$$,
                        TemplateValuePassword: createAuthState.$$PASSWORD$$,
                    },
                ],
            ),
        RefreshCredential: () =>
            this.requestRemoteRpcMethod("v1/PqTestService/RefreshCredential", [
                {
                    SessionId: this.sessionId,
                    PathToConnector: getFirstWorkspaceFolder()?.uri.fsPath,
                    PathToQueryFile: resolveSubstitutedValues(ExtensionConfigurations.DefaultQueryFileLocation),
                },
            ]),
        RunTestBattery: (pathToQueryFile: string | undefined) => {
            const activeTextEditor: TextEditor | undefined = vscode.window.activeTextEditor;

            const configPQTestQueryFileLocation: string | undefined = resolveSubstitutedValues(
                ExtensionConfigurations.DefaultQueryFileLocation,
            );

            // todo, maybe we could export this lang id to from the lang svc extension
            if (!pathToQueryFile && activeTextEditor?.document.languageId === "powerquery") {
                pathToQueryFile = activeTextEditor.document.uri.fsPath;
            }

            if (!pathToQueryFile && configPQTestQueryFileLocation) {
                pathToQueryFile = configPQTestQueryFileLocation;
            }

            return this.requestRemoteRpcMethod<PqServiceHostRunTestRequest>("v1/PqTestService/RunTestBattery", [
                {
                    SessionId: this.sessionId,
                    PathToConnector: getFirstWorkspaceFolder()?.uri.fsPath,
                    PathToQueryFile: pathToQueryFile,
                },
            ]);
        },
        TestConnection: () =>
            this.requestRemoteRpcMethod<PqServiceHostTestConnectionRequest>("v1/PqTestService/TestConnection", [
                {
                    SessionId: this.sessionId,
                    PathToConnector: getFirstWorkspaceFolder()?.uri.fsPath,
                    PathToQueryFile: resolveSubstitutedValues(ExtensionConfigurations.DefaultQueryFileLocation),
                },
            ]),
        RunTestBatteryFromContent: async (pathToQueryFile: string | undefined) => {
            const activeTextEditor: TextEditor | undefined = vscode.window.activeTextEditor;

            const configPQTestQueryFileLocation: string | undefined = resolveSubstitutedValues(
                ExtensionConfigurations.DefaultQueryFileLocation,
            );

            // todo, maybe we could export this lang id to from the lang svc extension
            if (!pathToQueryFile && activeTextEditor?.document.languageId === "powerquery") {
                pathToQueryFile = activeTextEditor.document.uri.fsPath;
            }

            if (!pathToQueryFile && configPQTestQueryFileLocation) {
                pathToQueryFile = configPQTestQueryFileLocation;
            }

            if (!pathToQueryFile || !fs.existsSync(pathToQueryFile)) return Promise.resolve();

            let currentContent: string = fs.readFileSync(pathToQueryFile, { encoding: "utf8" });
            let currentEditor: vscode.TextEditor | undefined = undefined;

            vscode.window.visibleTextEditors.forEach((oneEditor: vscode.TextEditor) => {
                if (
                    oneEditor?.document.languageId === "powerquery" &&
                    oneEditor.document.uri.fsPath === pathToQueryFile
                ) {
                    currentEditor = oneEditor;
                    currentContent = oneEditor.document.getText();
                }
            });

            // maybe we need to execute the build task before evaluating.
            await this.ExecuteBuildTaskAndAwaitIfNeeded();

            // only for RunTestBatteryFromContent,
            // PathToConnector would be full path of the current working folder
            // PathToQueryFile would be either the saved or unsaved content of the query file to be evaluated
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result: any = await this.requestRemoteRpcMethod<PqServiceHostRunTestRequest>(
                "v1/PqTestService/RunTestBatteryFromContent",
                [
                    {
                        SessionId: this.sessionId,
                        PathToConnector: getFirstWorkspaceFolder()?.uri.fsPath,
                        PathToQueryFile: currentContent,
                    },
                ],
            );

            if (result.Kind === 0 && result.Result.modifiedDocument && currentEditor) {
                const theCurrentEditor: vscode.TextEditor = currentEditor as vscode.TextEditor;
                const firstLine: vscode.TextLine = theCurrentEditor.document.lineAt(0);

                const lastLine: vscode.TextLine = theCurrentEditor.document.lineAt(
                    theCurrentEditor.document.lineCount - 1,
                );

                const textRange: vscode.Range = new vscode.Range(firstLine.range.start, lastLine.range.end);

                void theCurrentEditor.edit((editBuilder: vscode.TextEditorEdit) => {
                    editBuilder.replace(textRange, result.Result.modifiedDocument);
                });
            }

            return result;
        },
        ResolveResourceChallengeAsync: (state: ResolveResourceChallengeState) =>
            this.requestRemoteRpcMethod<PqServiceHostResolveResourceChallengeRequest>(
                "v1/PqTestService/ResolveResourceChallengeAsync",
                [
                    {
                        SessionId: this.sessionId,
                        PathToConnector: getFirstWorkspaceFolder()?.uri.fsPath,
                        PathToQueryFile: resolveSubstitutedValues(ExtensionConfigurations.DefaultQueryFileLocation),
                        DocumentScript: state.DocumentScript,
                        QueryName: state.QueryName,
                        ResourceKind: state.ResourceKind,
                        ResourcePath: state.ResourcePath,
                    },
                ],
            ),
    };

    public readonly healthService: IHealthService = {
        ForceShutdown: () =>
            this.requestRemoteRpcMethod("v1/HealthService/Shutdown", [
                {
                    SessionId: this.sessionId,
                },
            ]),
        Ping: () =>
            this.requestRemoteRpcMethod("v1/HealthService/Ping", [
                {
                    SessionId: this.sessionId,
                },
            ]),
    };

    public readonly documentService: IDocumentService = {
        TryParseDocumentScript: (documentScript: string) =>
            this.requestRemoteRpcMethod<PqServiceHostTestConnectionRequest>(
                "v1/DocumentService/TryParseDocumentScript",
                [
                    {
                        SessionId: this.sessionId,
                        // PathToConnector: getFirstWorkspaceFolder()?.uri.fsPath,
                        // PathToQueryFile: resolveSubstitutedValues(ExtensionConfigurations.DefaultQueryFileLocation),
                        DocumentScript: documentScript,
                    },
                ],
            ),
    };

    public readonly evaluationService: IEvaluationService = {
        GetPreviewAsync: (state: GetPreviewRequest) =>
            this.requestRemoteRpcMethod<PqServiceHostGetPreviewRequest>("v1/EvaluationService/GetPreview", [
                {
                    SessionId: this.sessionId,
                    PathToConnector: getFirstWorkspaceFolder()?.uri.fsPath,
                    PathToQueryFile: resolveSubstitutedValues(ExtensionConfigurations.DefaultQueryFileLocation),
                    DocumentScript: state.DocumentScript,
                    QueryName: state.QueryName,
                },
            ]),
    };
}

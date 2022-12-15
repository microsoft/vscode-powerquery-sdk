/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import { ChildProcess } from "child_process";
import { EventEmitter } from "events";
import { TextEditor } from "vscode";

import { CLOSED, ERROR, OPEN } from "../common/sockets/SocketClient";
import { CreateAuthState, Credential, ExtensionInfo, GenericResult, IPQTestService } from "../common/PQTestService";
import { defaultBackOff, JsonRpcSocketClient } from "../common/sockets/JsonRpcSocketClient";
import { delay, isPortBusy, pidIsRunning } from "../utils/pids";
import { getFirstWorkspaceFolder, resolveSubstitutedValues } from "../utils/vscodes";
import { AnyFunction } from "../common/promises/types";
import { convertStringToInteger } from "../utils/numbers";
import { executeBuildTaskAndAwaitIfNeeded } from "./PqTestTaskUtils";
import { ExtensionConfigurations } from "../constants/PowerQuerySdkConfiguration";
import { IDisposable } from "../common/Disposable";
import { PqSdkOutputChannelLight } from "../features/PqSdkOutputChannel";
import { SpawnedProcess } from "../common/SpawnedProcess";

export interface PqServiceHostRequestParamBase {
    SessionId: string;
    PathToConnector?: string;
    PathToQueryFile?: string;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
}

export enum ResponseStatus {
    Null = 0,
    Acknowledged = 1,
    Success = 2,
    Failure = 3,
}

export interface PqServiceHostResponseResult<T = string> {
    SessionId: string;
    Status: ResponseStatus;
    Payload: T;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    InnerException?: any;
}

export class PqServiceHostServerNotReady extends Error {
    constructor() {
        super("Cannot connect to the pqServiceHost");
    }
}

export class PqInternalError extends Error {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(message: string, public readonly data: any) {
        super(message);
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getInternalErrorMessage(innerError: any): string {
    if (typeof innerError === "string") {
        return innerError;
    } else if (typeof innerError === "object") {
        if (typeof innerError["Message"] === "string") {
            return innerError["Message"];
        } else if (typeof innerError["Details"] === "string") {
            return innerError["Details"];
        } else if (typeof innerError["message"] === "string") {
            return innerError["message"];
        } else if (typeof innerError["details"] === "string") {
            return innerError["details"];
        }
    }

    return JSON.stringify(innerError);
}

type OmittedPqTestMethods = "currentExtensionInfos" | "currentCredentials" | "ForceShutdown" | "Ping";

// eslint-disable-next-line @typescript-eslint/typedef
export const INIT = "PqServiceHostClientEvent_Init" as const;
// eslint-disable-next-line @typescript-eslint/typedef
export const RETRYING = "PqServiceHostClientEvent_Retrying" as const;
// eslint-disable-next-line @typescript-eslint/typedef
export const DISCONNECTED = "PqServiceHostClientEvent_Disconnected" as const;
// eslint-disable-next-line @typescript-eslint/typedef
export const READY = "PqServiceHostClientEvent_Ready" as const;
// eslint-disable-next-line @typescript-eslint/typedef
export const DISPOSED = "PqServiceHostClientEvent_Disposed" as const;

export class PqServiceHostClientLite
    extends EventEmitter
    implements Omit<IPQTestService, OmittedPqTestMethods>, IDisposable
{
    public static readonly ExecutableName: string = "PQServiceHost.exe";
    public static readonly ExecutablePidLockFileName: string = "PQServiceHost.pid";
    public static readonly ExecutablePortLockFileName: string = "PQServiceHost.port";

    pqTestReady: boolean = false;
    pqTestLocation: string = "";
    pqTestFullPath: string = "";

    private firstTimeStarted: boolean = true;
    protected readonly sessionId: string = vscode.env.sessionId;
    protected jsonRpcSocketClient: JsonRpcSocketClient | undefined = undefined;
    // private pingTimer: NodeJS.Timer | undefined = undefined;
    protected lastPqRelatedFileTouchedDate: Date = new Date(0);
    protected _disposables: Array<IDisposable> = [];

    public get pqServiceHostConnected(): boolean {
        return this.jsonRpcSocketClient?.status === OPEN;
    }

    constructor(protected readonly outputChannel: PqSdkOutputChannelLight) {
        super();
    }

    /**
     * Synchronized post-connection event
     * @protected
     */
    protected onConnected(): void {
        // noop
    }

    /**
     * Synchronized pre-disconnection event
     * @protected
     */
    protected onDisconnecting(): void {
        // noop
    }

    /**
     * Synchronized pre-reconnection event
     * @protected
     */
    protected onReconnecting(): void {
        // noop
    }

    public async requestRemoteRpcMethod<P extends PqServiceHostRequestParamBase = PqServiceHostRequestParamBase>(
        method: string,
        parameters: P[],
        options: {
            shouldParsePayload?: boolean;
        } = {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<any> {
        if (this.jsonRpcSocketClient) {
            const responseResult: PqServiceHostResponseResult = (await this.jsonRpcSocketClient.request(
                method,
                parameters,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            )) as PqServiceHostResponseResult<any>;

            if (responseResult.Status === ResponseStatus.Success) {
                if (options.shouldParsePayload && typeof responseResult.Payload === "string") {
                    try {
                        let theStr: string = responseResult.Payload;

                        theStr = theStr
                            .replace(/\\n/g, "\\n")
                            .replace(/\\'/g, "\\'")
                            .replace(/\\"/g, '\\"')
                            .replace(/\\&/g, "\\&")
                            .replace(/\\r/g, "\\r")
                            .replace(/\\t/g, "\\t")
                            .replace(/\\b/g, "\\b")
                            .replace(/\\f/g, "\\f")

                            // eslint-disable-next-line no-control-regex
                            .replace(/[\u0000-\u0019]+/g, "");

                        responseResult.Payload = JSON.parse(theStr);
                    } catch (e) {
                        // noop
                    }
                }

                return responseResult.Payload;
            } else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const errorData: any = responseResult.InnerException ?? responseResult.Payload;

                const errorMessage: string = getInternalErrorMessage(errorData);

                return Promise.reject(new PqInternalError(errorMessage, errorData));
            }
        } else {
            throw new PqServiceHostServerNotReady();
        }
    }

    private async createJsonRpcSocketClient(port: number): Promise<void> {
        this.outputChannel.appendInfoLine(`Start to listen PqServiceHost.exe at ${port}`);
        const theJsonRpcSocketClient: JsonRpcSocketClient = new JsonRpcSocketClient(port);

        try {
            await theJsonRpcSocketClient.open(defaultBackOff);
            this.emit(READY);
            this.jsonRpcSocketClient = theJsonRpcSocketClient;
        } catch (error: unknown) {
            this.outputChannel.appendErrorLine(`Failed to listen PqServiceHost.exe at ${port} due to ${error}`);
        }

        if (theJsonRpcSocketClient.status === OPEN) {
            this.outputChannel.appendInfoLine(`Succeed listening PqServiceHost.exe at ${port}`);

            // check whether it were the first time staring for the current maybe existing workspace
            if (this.firstTimeStarted) {
                // and we also need to ensure we got a valid pq connector mez file
                const currentPQTestExtensionFileLocation: string | undefined =
                    ExtensionConfigurations.DefaultExtensionLocation;

                const resolvedPQTestExtensionFileLocation: string | undefined = currentPQTestExtensionFileLocation
                    ? resolveSubstitutedValues(currentPQTestExtensionFileLocation)
                    : undefined;

                if (resolvedPQTestExtensionFileLocation && fs.existsSync(resolvedPQTestExtensionFileLocation)) {
                    // trigger one display extension info task to populate modules in the pq-lang ext
                    void this.DisplayExtensionInfo();
                }

                this.firstTimeStarted = false;
            }

            this.onConnected();

            const handleJsonRpcSocketError: AnyFunction = (event: Error) => {
                this.outputChannel.appendErrorLine(
                    `Connection to PqServiceHost.exe at ${port} encounter ${event.message}`,
                );
            };

            const handleJsonRpcSocketExiting: AnyFunction = () => {
                this.outputChannel.appendErrorLine(
                    `Failed to listen PqServiceHost.exe at ${port}, will try to reconnect in 2 sec`,
                );

                this.onDisconnecting();

                setTimeout(() => {
                    this.onPowerQueryTestLocationChanged();
                }, 250);

                theJsonRpcSocketClient.off(CLOSED, handleJsonRpcSocketExiting);
                theJsonRpcSocketClient.off(ERROR, handleJsonRpcSocketError);
            };

            theJsonRpcSocketClient.on(CLOSED, handleJsonRpcSocketExiting);
            theJsonRpcSocketClient.on(ERROR, handleJsonRpcSocketError);
        }
    }

    private resolvePQServiceHostPath(nextPQTestLocation: string | undefined): string | undefined {
        if (!nextPQTestLocation) {
            this.outputChannel.appendErrorLine("powerquery.sdk.tools.location configuration value is not set.");

            return undefined;
        } else if (!fs.existsSync(nextPQTestLocation)) {
            this.outputChannel.appendErrorLine(
                `powerquery.sdk.tools.location set to '${nextPQTestLocation}' but directory does not exist.`,
            );

            return undefined;
        }

        const pqServiceHostExe: string = path.resolve(nextPQTestLocation, PqServiceHostClientLite.ExecutableName);

        if (!fs.existsSync(pqServiceHostExe)) {
            this.outputChannel.appendErrorLine(`PqServiceHost.exe not found at ${pqServiceHostExe}`);

            return undefined;
        }

        return pqServiceHostExe;
    }

    private disposeCurrentJsonRpcSocketClient(): void {
        if (this.jsonRpcSocketClient) {
            this.onDisconnecting();
            void this.jsonRpcSocketClient.close();
            this.jsonRpcSocketClient = undefined;
            this.emit(DISPOSED);

            this.outputChannel.appendInfoLine(`Stop listening PqServiceHost.exe`);
        }
    }

    private doSeizeNumberFromLockFile(theLockFileFullPath: string): number | undefined {
        if (!fs.existsSync(theLockFileFullPath)) {
            return undefined;
        }

        const pidString: string = fs.readFileSync(theLockFileFullPath).toString("utf8");

        return convertStringToInteger(pidString);
    }

    private doStartAndListenPqServiceHostIfNeededInProgress: boolean = false;
    private async doStartAndListenPqServiceHostIfNeeded(
        nextPQTestLocation: string,
        tryNumber: number = 0,
    ): Promise<void> {
        if (this.doStartAndListenPqServiceHostIfNeededInProgress) return;

        if (tryNumber > 4) {
            this.emit(DISCONNECTED);

            return;
        }

        try {
            this.doStartAndListenPqServiceHostIfNeededInProgress = true;

            const pidFileFullPath: string = path.resolve(
                nextPQTestLocation,
                PqServiceHostClientLite.ExecutablePidLockFileName,
            );

            const portFileFullPath: string = path.resolve(
                nextPQTestLocation,
                PqServiceHostClientLite.ExecutablePortLockFileName,
            );

            let pidNumber: number | undefined = this.doSeizeNumberFromLockFile(pidFileFullPath);

            // check if we need to start the pqServiceHost for the first time
            if (typeof pidNumber !== "number" || !pidIsRunning(pidNumber.valueOf())) {
                // pause a little while to enlarge the chances that other service hosts fully shutdown
                await delay(250);

                new SpawnedProcess(
                    path.resolve(nextPQTestLocation, PqServiceHostClientLite.ExecutableName),
                    [],
                    { cwd: this.pqTestLocation, detached: true },
                    {
                        onSpawned: (childProcess: ChildProcess): void => {
                            if (Number.isInteger(childProcess.pid)) {
                                pidNumber = childProcess.pid;
                            }
                        },
                    },
                );

                this.outputChannel.appendInfoLine(`#${tryNumber + 1} try to boot PqServiceHost.exe`);
            }

            if (!Number.isInteger(pidNumber)) {
                // pause for effects
                await delay(500);
                // eslint-disable-next-line require-atomic-updates
                pidNumber = this.doSeizeNumberFromLockFile(pidFileFullPath);
            }

            let portNumber: number | undefined = undefined;
            let portInUse: boolean = false;
            let maxTry: number = 4;

            while (maxTry > 0 && !portInUse) {
                // eslint-disable-next-line no-await-in-loop
                await delay(895);
                portNumber = this.doSeizeNumberFromLockFile(portFileFullPath);

                if (typeof portNumber === "number") {
                    // eslint-disable-next-line no-await-in-loop
                    portInUse = await isPortBusy(portNumber);
                }

                this.outputChannel.appendInfoLine(
                    `Check #[${5 - maxTry}] whether PqServiceHost.exe exported at ${portNumber}, ${portInUse}`,
                );

                maxTry--;
            }

            if (typeof pidNumber === "number" && typeof portNumber === "number") {
                this.disposeCurrentJsonRpcSocketClient();
                await this.createJsonRpcSocketClient(portNumber);
            }
        } finally {
            this.doStartAndListenPqServiceHostIfNeededInProgress = false;
        }

        setTimeout(() => {
            if (!this.pqServiceHostConnected) {
                this.emit(RETRYING);
                void this.doStartAndListenPqServiceHostIfNeeded(nextPQTestLocation, tryNumber + 1);
            }
        }, 750);
    }

    public onPowerQueryTestLocationChanged(): void {
        // PQTestLocation getter
        const nextPQTestLocation: string | undefined = ExtensionConfigurations.PQTestLocation;
        const pqServiceHostExe: string | undefined = this.resolvePQServiceHostPath(nextPQTestLocation);

        if (!pqServiceHostExe || !nextPQTestLocation) {
            this.pqTestReady = false;
            this.pqTestLocation = "";
            this.pqTestFullPath = "";
        } else {
            this.pqTestReady = true;
            this.pqTestLocation = nextPQTestLocation;
            this.pqTestFullPath = pqServiceHostExe;
            this.outputChannel.appendInfoLine(`PqServiceHost.exe found at ${this.pqTestFullPath}`);

            this.onReconnecting();
            this.emit(INIT);
            void this.doStartAndListenPqServiceHostIfNeeded(nextPQTestLocation);
        }
    }

    public dispose(): void {
        for (const oneDisposable of this._disposables) {
            oneDisposable.dispose();
        }

        this.disposeCurrentJsonRpcSocketClient();
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

    DeleteCredential(): Promise<GenericResult> {
        return this.requestRemoteRpcMethod("v1/PqTestService/DeleteCredential", [
            {
                SessionId: this.sessionId,
                PathToConnector: getFirstWorkspaceFolder()?.uri.fsPath,
                AllCredentials: true,
            },
        ]);
    }

    DisplayExtensionInfo(): Promise<ExtensionInfo[]> {
        return this.requestRemoteRpcMethod(
            "v1/PqTestService/DisplayExtensionInfo",
            [
                {
                    SessionId: this.sessionId,
                    PathToConnector: getFirstWorkspaceFolder()?.uri.fsPath,
                },
            ],
            { shouldParsePayload: true },
        );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    GenerateCredentialTemplate(): Promise<any> {
        return this.requestRemoteRpcMethod(
            "v1/PqTestService/GenerateCredentialTemplate",
            [
                {
                    SessionId: this.sessionId,
                    PathToConnector: getFirstWorkspaceFolder()?.uri.fsPath,
                    PathToQueryFile: resolveSubstitutedValues(ExtensionConfigurations.DefaultQueryFileLocation),
                },
            ],
            { shouldParsePayload: true },
        );
    }

    ListCredentials(): Promise<Credential[]> {
        return this.requestRemoteRpcMethod("v1/PqTestService/ListCredentials", [
            {
                SessionId: this.sessionId,
            },
        ]);
    }

    RefreshCredential(): Promise<GenericResult> {
        return this.requestRemoteRpcMethod("v1/PqTestService/RefreshCredential", [
            {
                SessionId: this.sessionId,
                PathToConnector: getFirstWorkspaceFolder()?.uri.fsPath,
                PathToQueryFile: resolveSubstitutedValues(ExtensionConfigurations.DefaultQueryFileLocation),
            },
        ]);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    RunTestBattery(pathToQueryFile: string | undefined): Promise<any> {
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

        return this.requestRemoteRpcMethod("v1/PqTestService/RunTestBattery", [
            {
                SessionId: this.sessionId,
                PathToConnector: getFirstWorkspaceFolder()?.uri.fsPath,
                PathToQueryFile: pathToQueryFile,
            },
        ]);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async RunTestBatteryFromContent(pathToQueryFile: string | undefined): Promise<any> {
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

        vscode.window.visibleTextEditors.forEach((oneEditor: vscode.TextEditor) => {
            if (oneEditor?.document.languageId === "powerquery" && oneEditor.document.uri.fsPath === pathToQueryFile) {
                currentContent = oneEditor.document.getText();
            }
        });

        // maybe we need to execute the build task before evaluating.
        await this.ExecuteBuildTaskAndAwaitIfNeeded();

        // only for RunTestBatteryFromContent,
        // PathToConnector would be full path of the current working folder
        // PathToQueryFile would be either the saved or unsaved content of the query file to be evaluated
        return this.requestRemoteRpcMethod("v1/PqTestService/RunTestBatteryFromContent", [
            {
                SessionId: this.sessionId,
                PathToConnector: getFirstWorkspaceFolder()?.uri.fsPath,
                PathToQueryFile: currentContent,
            },
        ]);
    }

    SetCredential(payloadStr: string): Promise<GenericResult> {
        return this.requestRemoteRpcMethod("v1/PqTestService/SetCredential", [
            {
                SessionId: this.sessionId,
                PathToConnector: getFirstWorkspaceFolder()?.uri.fsPath,
                PathToQueryFile: resolveSubstitutedValues(ExtensionConfigurations.DefaultQueryFileLocation),
                InputTemplateString: payloadStr,
            },
        ]);
    }

    SetCredentialFromCreateAuthState(createAuthState: CreateAuthState): Promise<GenericResult> {
        return this.requestRemoteRpcMethod("v1/PqTestService/SetCredentialFromCreateAuthState", [
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
        ]);
    }

    TestConnection(): Promise<GenericResult> {
        return this.requestRemoteRpcMethod("v1/PqTestService/TestConnection", [
            {
                SessionId: this.sessionId,
                PathToConnector: getFirstWorkspaceFolder()?.uri.fsPath,
                PathToQueryFile: resolveSubstitutedValues(ExtensionConfigurations.DefaultQueryFileLocation),
            },
        ]);
    }
}

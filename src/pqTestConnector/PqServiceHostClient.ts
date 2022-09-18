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
import { TextEditor } from "vscode";
import WebSocket from "ws";

import { CreateAuthState, Credential, ExtensionInfo, GenericResult, IPQTestService } from "../common/PQTestService";
import { delay, isPortBusy, pidIsRunning } from "../utils/pids";
import { getCtimeOfAFile, globFiles } from "../utils/files";
import { getFirstWorkspaceFolder, resolveSubstitutedValues } from "../utils/vscodes";

import { CLOSED, OPEN } from "../common/websockets/WebSocketClient";
import { defaultBackOff, JsonRpcWebSocketClient } from "../common/websockets/JsonRpcWebSocketClient";
import { GlobalEventBus, GlobalEvents } from "../GlobalEventBus";
import { AnyFunction } from "../common/promises/types";
import { convertStringToInteger } from "../utils/numbers";
import { ExtensionConfigurations } from "../constants/PowerQuerySdkConfiguration";
import { IDisposable } from "../common/Disposable";
import { PowerQueryTaskProvider } from "../features/PowerQueryTaskProvider";
import { PqSdkOutputChannel } from "../features/PqSdkOutputChannel";
import { SpawnedProcess } from "../common/SpawnedProcess";
import { ValueEventEmitter } from "../common/ValueEventEmitter";

enum ResponseStatus {
    Null = 0,
    Acknowledged = 1,
    Success = 2,
    Failure = 3,
}

interface PqServiceHostResponseResult<T = string> {
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

export class PqServiceHostClient implements IPQTestService, IDisposable {
    public static readonly ExecutableName: string = "PQServiceHost.exe";
    public static readonly ExecutablePidLockFileName: string = "PQServiceHost.pid";
    public static readonly ExecutablePortLockFileName: string = "PQServiceHost.port";

    pqTestReady: boolean = false;
    pqTestLocation: string = "";
    pqTestFullPath: string = "";

    private firstTimeStarted: boolean = true;
    private lastPqRelatedFileTouchedDate: Date = new Date(0);
    private readonly sessionId: string = vscode.env.sessionId;
    private jsonRpcWebSocketClient: JsonRpcWebSocketClient | undefined = undefined;
    private pingTimer: NodeJS.Timer | undefined = undefined;
    protected _disposables: Array<IDisposable> = [];

    public get pqServiceHostConnected(): boolean {
        return Boolean(this.pingTimer);
    }

    public readonly currentExtensionInfos: ValueEventEmitter<ExtensionInfo[]> = new ValueEventEmitter<ExtensionInfo[]>(
        [],
    );
    public readonly currentCredentials: ValueEventEmitter<Credential[]> = new ValueEventEmitter<Credential[]>([]);

    constructor(private readonly globalEventBus: GlobalEventBus, private readonly outputChannel: PqSdkOutputChannel) {
        // watch vsc ConfigDidChangePowerQuerySDK changes
        this._disposables.unshift(
            this.globalEventBus.subscribeOneEvent(
                GlobalEvents.VSCodeEvents.ConfigDidChangePowerQueryTestLocation,
                this.onPowerQueryTestLocationChanged.bind(this),
            ),
        );

        this.onPowerQueryTestLocationChanged();

        vscode.workspace.onDidSaveTextDocument((textDocument: vscode.TextDocument) => {
            if (
                (textDocument.uri.fsPath.indexOf(".pq") > -1 && textDocument.uri.fsPath.indexOf(".query.pq") === -1) ||
                textDocument.uri.fsPath.indexOf(".m") > -1
            ) {
                this.lastPqRelatedFileTouchedDate = new Date();
            }
        });

        vscode.workspace.onDidCreateFiles((evt: vscode.FileCreateEvent) => {
            const filteredPaths: string[] = evt.files
                .filter(
                    (oneUri: vscode.Uri) =>
                        (oneUri.fsPath.indexOf(".pq") > -1 && oneUri.fsPath.indexOf(".query.pq") === -1) ||
                        oneUri.fsPath.indexOf(".m") > -1,
                )
                .map((oneUri: vscode.Uri) => oneUri.fsPath);

            if (filteredPaths.length) {
                this.lastPqRelatedFileTouchedDate = new Date();
            }
        });
    }

    private async callRemoteRpcMethod(
        method: string,
        parameters: unknown[],
        options: {
            shouldParsePayload?: boolean;
        } = {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<any> {
        if (this.jsonRpcWebSocketClient) {
            const responseResult: PqServiceHostResponseResult = (await this.jsonRpcWebSocketClient.call(
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

                // todo, mv this logic to pqServiceHost
                if (method === "v1/PqTestService/DisplayExtensionInfo") {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    this.currentExtensionInfos.emit(responseResult.Payload as any);
                } else if (method === "v1/PqTestService/ListCredentials") {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    this.currentCredentials.emit(responseResult.Payload as any);
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

    private async createJsonRpcWebsocketClient(port: number): Promise<void> {
        this.outputChannel.appendInfoLine(`Start to listen PqServiceHost.exe at ${port}`);
        // todo enhance this tcp conn
        const theJsonRpcWebSocketClient: JsonRpcWebSocketClient = new JsonRpcWebSocketClient(`ws://127.0.0.1:${port}`);

        try {
            await theJsonRpcWebSocketClient.open(defaultBackOff);
            this.jsonRpcWebSocketClient = theJsonRpcWebSocketClient;
        } catch (error: unknown) {
            this.outputChannel.appendErrorLine(`Failed to listen PqServiceHost.exe at ${port} due to ${error}`);
        }

        if (theJsonRpcWebSocketClient.status === OPEN) {
            this.outputChannel.appendInfoLine(`Succeed listening PqServiceHost.exe at ${port}`);

            // check whether it were the first time staring for the current maybe existing workspace
            if (this.firstTimeStarted) {
                // and we also need to ensure we got a valid pq connector mez file
                const currentPQTestExtensionFileLocation: string | undefined =
                    ExtensionConfigurations.PQTestExtensionFileLocation;

                const resolvedPQTestExtensionFileLocation: string | undefined = currentPQTestExtensionFileLocation
                    ? resolveSubstitutedValues(currentPQTestExtensionFileLocation)
                    : undefined;

                if (resolvedPQTestExtensionFileLocation && fs.existsSync(resolvedPQTestExtensionFileLocation)) {
                    // trigger one display extension info task to populate modules in the pq-lang ext
                    void this.DisplayExtensionInfo();
                }

                this.firstTimeStarted = false;
            }

            this.startToSendPingMessages();

            const handleJsonRpcWsClientClosed: AnyFunction = (event: WebSocket.CloseEvent) => {
                this.outputChannel.appendErrorLine(
                    `Failed to listen PqServiceHost.exe at ${port} due to ${event.reason}, will try to reconnect in 2 sec`,
                );

                this.stopSendingPingMessages();

                setTimeout(() => {
                    this.onPowerQueryTestLocationChanged();
                }, 250);

                theJsonRpcWebSocketClient.off(CLOSED, handleJsonRpcWsClientClosed);
            };

            theJsonRpcWebSocketClient.on(CLOSED, handleJsonRpcWsClientClosed);
        }
    }

    private startToSendPingMessages(): void {
        this.pingTimer = setInterval(() => {
            void this.Ping();
        }, 1950);
    }

    private stopSendingPingMessages(): void {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = undefined;
        }
    }

    private resolvePQServiceHostPath(nextPQTestLocation: string | undefined): string | undefined {
        if (!nextPQTestLocation) {
            this.outputChannel.appendErrorLine("powerquery.sdk.pqtest.location configuration value is not set.");

            return undefined;
        } else if (!fs.existsSync(nextPQTestLocation)) {
            this.outputChannel.appendErrorLine(
                `powerquery.sdk.pqtest.location set to '${nextPQTestLocation}' but directory does not exist.`,
            );

            return undefined;
        }

        const pqServiceHostExe: string = path.resolve(nextPQTestLocation, PqServiceHostClient.ExecutableName);

        if (!fs.existsSync(pqServiceHostExe)) {
            this.outputChannel.appendErrorLine(`PqServiceHost.exe not found at ${pqServiceHostExe}`);

            return undefined;
        }

        return pqServiceHostExe;
    }

    private disposeCurrentJsonRpcWebsocketClient(): void {
        if (this.jsonRpcWebSocketClient) {
            this.stopSendingPingMessages();
            void this.jsonRpcWebSocketClient.close();
            this.jsonRpcWebSocketClient = undefined;
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
        if (this.doStartAndListenPqServiceHostIfNeededInProgress || tryNumber > 4) return;

        try {
            this.doStartAndListenPqServiceHostIfNeededInProgress = true;

            const pidFileFullPath: string = path.resolve(
                nextPQTestLocation,
                PqServiceHostClient.ExecutablePidLockFileName,
            );

            const portFileFullPath: string = path.resolve(
                nextPQTestLocation,
                PqServiceHostClient.ExecutablePortLockFileName,
            );

            let pidNumber: number | undefined = this.doSeizeNumberFromLockFile(pidFileFullPath);

            // check if we need to start the pqServiceHost for the first time
            if (typeof pidNumber !== "number" || !pidIsRunning(pidNumber.valueOf())) {
                // pause a little while to enlarge the chances that other service hosts fully shutdown
                await delay(250);

                new SpawnedProcess(
                    path.resolve(nextPQTestLocation, PqServiceHostClient.ExecutableName),
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
                this.disposeCurrentJsonRpcWebsocketClient();
                await this.createJsonRpcWebsocketClient(portNumber);
            }
        } finally {
            this.doStartAndListenPqServiceHostIfNeededInProgress = false;
        }

        setTimeout(() => {
            if (!this.pqServiceHostConnected) {
                void this.doStartAndListenPqServiceHostIfNeeded(nextPQTestLocation, tryNumber + 1);
            }
        }, 750);
    }

    onPowerQueryTestLocationChanged(): void {
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

            // we were already listening to a service host
            if (this.pingTimer) {
                // thus we need to shut it down
                void this.ForceShutdown();
                // and clear the pinger interval
                this.stopSendingPingMessages();
            }

            void this.doStartAndListenPqServiceHostIfNeeded(nextPQTestLocation);
        }
    }

    dispose(): void {
        for (const oneDisposable of this._disposables) {
            oneDisposable.dispose();
        }

        this.stopSendingPingMessages();
        this.currentExtensionInfos.dispose();
        this.currentCredentials.dispose();
        this.disposeCurrentJsonRpcWebsocketClient();
    }

    async MaybeExecuteBuildTask(): Promise<void> {
        const maybeCurrentWorkspace: string | undefined = getFirstWorkspaceFolder()?.uri.fsPath;
        let needToRebuildBeforeEvaluation: boolean = true;

        if (maybeCurrentWorkspace) {
            const currentlyAllMezFiles: string[] = [];

            for await (const oneFullPath of globFiles(path.join(maybeCurrentWorkspace, "bin"), (fullPath: string) =>
                fullPath.endsWith(".mez"),
            )) {
                currentlyAllMezFiles.push(oneFullPath);
            }

            if (currentlyAllMezFiles.length === 1) {
                const theCtimeOfTheFile: Date = getCtimeOfAFile(currentlyAllMezFiles[0]);
                needToRebuildBeforeEvaluation = theCtimeOfTheFile <= this.lastPqRelatedFileTouchedDate;
            } else {
                needToRebuildBeforeEvaluation = true;
            }

            if (needToRebuildBeforeEvaluation) {
                // remove all existing mez file
                currentlyAllMezFiles.forEach((oneMezFileFullPath: string) => {
                    fs.unlinkSync(oneMezFileFullPath);
                });

                // choose msbuild or makePQX compile as the build task
                let theBuildTask: vscode.Task = PowerQueryTaskProvider.buildMakePQXCompileTask(this.pqTestLocation);

                if (ExtensionConfigurations.msbuildPath) {
                    theBuildTask = PowerQueryTaskProvider.buildMsbuildTask();
                }

                // we should set lastPqRelatedFileTouchedDate first to ensure it is less than the new build's ctime
                this.lastPqRelatedFileTouchedDate = new Date();

                await PowerQueryTaskProvider.executeTask(theBuildTask);
            }
        }
    }

    DeleteCredential(): Promise<GenericResult> {
        return this.callRemoteRpcMethod("v1/PqTestService/DeleteCredential", [
            {
                SessionId: this.sessionId,
                PathToConnector: getFirstWorkspaceFolder()?.uri.fsPath,
                AllCredentials: true,
            },
        ]);
    }

    DisplayExtensionInfo(): Promise<ExtensionInfo[]> {
        return this.callRemoteRpcMethod(
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
        return this.callRemoteRpcMethod(
            "v1/PqTestService/GenerateCredentialTemplate",
            [
                {
                    SessionId: this.sessionId,
                    PathToConnector: getFirstWorkspaceFolder()?.uri.fsPath,
                    PathToQueryFile: resolveSubstitutedValues(ExtensionConfigurations.PQTestQueryFileLocation),
                },
            ],
            { shouldParsePayload: true },
        );
    }

    ListCredentials(): Promise<Credential[]> {
        return this.callRemoteRpcMethod("v1/PqTestService/ListCredentials", [
            {
                SessionId: this.sessionId,
            },
        ]);
    }

    RefreshCredential(): Promise<GenericResult> {
        return this.callRemoteRpcMethod("v1/PqTestService/RefreshCredential", [
            {
                SessionId: this.sessionId,
                PathToConnector: getFirstWorkspaceFolder()?.uri.fsPath,
                PathToQueryFile: resolveSubstitutedValues(ExtensionConfigurations.PQTestQueryFileLocation),
            },
        ]);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    RunTestBattery(pathToQueryFile: string | undefined): Promise<any> {
        const activeTextEditor: TextEditor | undefined = vscode.window.activeTextEditor;

        const configPQTestQueryFileLocation: string | undefined = resolveSubstitutedValues(
            ExtensionConfigurations.PQTestQueryFileLocation,
        );

        // todo, maybe we could export this lang id to from the lang svc extension
        if (!pathToQueryFile && activeTextEditor?.document.languageId === "powerquery") {
            pathToQueryFile = activeTextEditor.document.uri.fsPath;
        }

        if (!pathToQueryFile && configPQTestQueryFileLocation) {
            pathToQueryFile = configPQTestQueryFileLocation;
        }

        return this.callRemoteRpcMethod("v1/PqTestService/RunTestBattery", [
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
            ExtensionConfigurations.PQTestQueryFileLocation,
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
        await this.MaybeExecuteBuildTask();

        // only for RunTestBatteryFromContent,
        // PathToConnector would be full path of the current working folder
        // PathToQueryFile would be either the saved or unsaved content of the query file to be evaluated
        return this.callRemoteRpcMethod("v1/PqTestService/RunTestBatteryFromContent", [
            {
                SessionId: this.sessionId,
                PathToConnector: getFirstWorkspaceFolder()?.uri.fsPath,
                PathToQueryFile: currentContent,
            },
        ]);
    }

    SetCredential(payloadStr: string): Promise<GenericResult> {
        return this.callRemoteRpcMethod("v1/PqTestService/RefreshCredential", [
            {
                SessionId: this.sessionId,
                PathToConnector: getFirstWorkspaceFolder()?.uri.fsPath,
                PathToQueryFile: resolveSubstitutedValues(ExtensionConfigurations.PQTestQueryFileLocation),
                InputTemplateString: payloadStr,
            },
        ]);
    }

    SetCredentialFromCreateAuthState(createAuthState: CreateAuthState): Promise<GenericResult> {
        return this.callRemoteRpcMethod("v1/PqTestService/SetCredentialFromCreateAuthState", [
            {
                SessionId: this.sessionId,
                PathToConnector: getFirstWorkspaceFolder()?.uri.fsPath,
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
        return this.callRemoteRpcMethod("v1/PqTestService/TestConnection", [
            {
                SessionId: this.sessionId,
                PathToConnector: getFirstWorkspaceFolder()?.uri.fsPath,
                PathToQueryFile: resolveSubstitutedValues(ExtensionConfigurations.PQTestQueryFileLocation),
            },
        ]);
    }

    ForceShutdown(): Promise<number> {
        return this.callRemoteRpcMethod("v1/HealthService/Shutdown", [
            {
                SessionId: this.sessionId,
            },
        ]);
    }

    Ping(): Promise<number> {
        return this.callRemoteRpcMethod("v1/HealthService/Ping", [
            {
                SessionId: this.sessionId,
            },
        ]);
    }
}

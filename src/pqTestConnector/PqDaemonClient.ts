/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as fs from "fs";
import * as net from "net";
import * as path from "path";
import * as vscode from "vscode";

import {
    Message,
    RequestMessage,
    ResponseError,
    ResponseMessage,
    SocketMessageReader,
    SocketMessageWriter,
} from "vscode-jsonrpc/node";

import { ChildProcess } from "child_process";
import { TextEditor } from "vscode";

import { CreateAuthState, Credential, ExtensionInfo, GenericResult, IPQTestService } from "common/PQTestService";
import { delay, isPortBusy, pidIsRunning } from "utils/pids";
import { GlobalEventBus, GlobalEvents } from "GlobalEventBus";

import { convertStringToInteger } from "utils/numbers";
import { ExtensionConfigurations } from "constants/PowerQuerySdkConfiguration";
import { IDisposable } from "common/Disposable";
import { PqSdkOutputChannel } from "features/PqSdkOutputChannel";
import { resolveSubstitutedValues } from "utils/vscodes";
import { SpawnedProcess } from "common/SpawnedProcess";
import { ValueEventEmitter } from "common/ValueEventEmitter";

interface ServerTransportTuple {
    readonly status: {
        port: number;
        live: boolean;
    };
    readonly socket: net.Socket;
    readonly reader: SocketMessageReader;
    readonly writer: SocketMessageWriter;
}

interface PqDaemonRequestParamBase {
    SessionId: string;
    PathToConnector?: string;
    PathToQueryFile?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
}

interface PqDaemonRequest<T extends PqDaemonRequestParamBase = PqDaemonRequestParamBase> extends RequestMessage {
    /**
     * The request id.
     */
    id: string;
    /**
     * The method to be invoked.
     */
    method: string;
    /**
     * The method's params.
     */
    params: [T];
}

enum ResponseStatus {
    Null = 0,
    Acknowledged = 1,
    Success = 2,
    Failure = 3,
}

interface PqDaemonResponseBase<T = string> extends ResponseMessage {
    id: string;
    result: {
        SessionId: string;
        Status: ResponseStatus;
        Payload: T;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        InnerException?: any;
    };
}

/**
 * Internal interface within the module, we need not cast members as readonly
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface PqDaemonTask<Req extends PqDaemonRequestParamBase = PqDaemonRequestParamBase, Res = any> {
    request: PqDaemonRequest<Req>;
    options: {
        shouldParsePayload?: boolean;
    };
    resolve: (res: Res) => void;
    reject: (reason: Error | string) => void;
}

const JSON_RPC_VERSION: string = "2.0";

export class PqDaemonServerNotReady extends Error {
    constructor() {
        super("Cannot connect to the pqDaemon");
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

export class PqDaemonClient implements IPQTestService, IDisposable {
    public static readonly ExecutableName: string = "PqDaemon.exe";
    public static readonly ExecutablePidLockFileName: string = "PqDaemon.pid";
    public static readonly ExecutablePortLockFileName: string = "PqDaemon.port";

    pqTestReady: boolean = false;
    pqTestLocation: string = "";
    pqTestFullPath: string = "";

    private _sequenceSeed: number = Date.now();
    private readonly sessionId: string = vscode.env.sessionId;
    private pendingTaskMap: Map<string, PqDaemonTask> = new Map();
    private serverTransportTuple: ServerTransportTuple | undefined = undefined;
    protected _disposables: Array<IDisposable> = [];

    public get pqDaemonConnected(): boolean {
        return Boolean(this.serverTransportTuple);
    }

    private get nextSequenceId(): string {
        return `${this.sessionId}-${this._sequenceSeed++}`;
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
    }

    private handleRpcMessage(message: Message): void {
        if (message.jsonrpc === JSON_RPC_VERSION && this.pendingTaskMap.has(`${(message as ResponseMessage).id}`)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const responseMessage: PqDaemonResponseBase = message as PqDaemonResponseBase<any>;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const maybePendingTask: PqDaemonTask<any> | undefined = this.pendingTaskMap.get(responseMessage.id);

            if (maybePendingTask) {
                // no need to check the session within the result
                if (responseMessage.error) {
                    maybePendingTask.reject(
                        new ResponseError(
                            responseMessage.error.code,
                            responseMessage.error.message,
                            responseMessage.error.data,
                        ),
                    );
                } else if (responseMessage.result.Status === ResponseStatus.Success) {
                    if (
                        maybePendingTask.options.shouldParsePayload &&
                        typeof responseMessage.result.Payload === "string"
                    ) {
                        try {
                            let theStr: string = responseMessage.result.Payload;

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

                            responseMessage.result.Payload = JSON.parse(theStr);
                        } catch (e) {
                            // noop
                        }
                    }

                    // todo, mv this logic to pqDaemon
                    if (maybePendingTask.request.method === "DisplayExtensionInfo") {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        this.currentExtensionInfos.emit(responseMessage.result.Payload as any);
                    } else if (maybePendingTask.request.method === "ListCredentials") {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        this.currentCredentials.emit(responseMessage.result.Payload as any);
                    }

                    maybePendingTask.resolve(responseMessage.result.Payload);
                } else {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const errorData: any = responseMessage.result.InnerException ?? responseMessage.result.Payload;

                    const errorMessage: string = getInternalErrorMessage(errorData);
                    maybePendingTask.reject(new PqInternalError(errorMessage, errorData));
                }

                this.pendingTaskMap.delete(responseMessage.id);
            }
        }
    }

    private createServerSocketTransport(port: number): void {
        this.outputChannel.appendInfoLine(`Start to listen PqDaemon.exe at ${port}`);
        const socket: net.Socket = net.createConnection(port, "127.0.0.1");
        socket.setTimeout(0);
        socket.setKeepAlive(true);
        const reader: SocketMessageReader = new SocketMessageReader(socket, "utf-8");
        const writer: SocketMessageWriter = new SocketMessageWriter(socket, "utf-8");

        const theServerTransportTuple: ServerTransportTuple = Object.freeze({
            status: {
                port,
                live: true,
            },
            socket,
            reader,
            writer,
        });

        socket.on("connect", () => {
            this.outputChannel.appendInfoLine(`Succeed listening PqDaemon.exe at ${port}`);
        });

        socket.on("error", (err: Error) => {
            this.outputChannel.appendErrorLine(
                `Failed to listen PqDaemon.exe at ${port} due to ${err.message}, will try to reconnect in 2 sec`,
            );

            setTimeout(() => {
                this.onPowerQueryTestLocationChanged();
            }, 250);
        });

        reader.listen((data: Message) => {
            if (theServerTransportTuple.status.live) {
                this.handleRpcMessage.call(this, data);
            }
        });

        this.serverTransportTuple = theServerTransportTuple;
    }

    private resolvePQDaemonPath(nextPQTestLocation: string | undefined): string | undefined {
        if (!nextPQTestLocation) {
            this.outputChannel.appendErrorLine("powerquery.sdk.pqtest.location configuration value is not set.");

            return undefined;
        } else if (!fs.existsSync(nextPQTestLocation)) {
            this.outputChannel.appendErrorLine(
                `powerquery.sdk.pqtest.location set to '${nextPQTestLocation}' but directory does not exist.`,
            );

            return undefined;
        }

        const pqtestExe: string = path.resolve(nextPQTestLocation, PqDaemonClient.ExecutableName);

        if (!fs.existsSync(pqtestExe)) {
            this.outputChannel.appendErrorLine(`pqDaemon.exe not found at ${pqtestExe}`);

            return undefined;
        }

        return pqtestExe;
    }

    private disposeCurrentServerTransportTuple(): void {
        if (this.serverTransportTuple) {
            this.outputChannel.appendInfoLine(
                `Stop listening PqDaemon.exe at ${this.serverTransportTuple.status.port}`,
            );

            this.serverTransportTuple.status.live = false;
            this.serverTransportTuple.socket.emit("close");
            this.serverTransportTuple = undefined;
        }
    }

    private doSeizeNumberFromLockFile(theLockFileFullPath: string): number | undefined {
        if (!fs.existsSync(theLockFileFullPath)) {
            return undefined;
        }

        const pidString: string = fs.readFileSync(theLockFileFullPath).toString("utf8");

        return convertStringToInteger(pidString);
    }

    private async doStartAndListenPqDaemonIfNeeded(nextPQTestLocation: string): Promise<void> {
        const pidFileFullPath: string = path.resolve(nextPQTestLocation, PqDaemonClient.ExecutablePidLockFileName);
        const portFileFullPath: string = path.resolve(nextPQTestLocation, PqDaemonClient.ExecutablePortLockFileName);

        let pidNumber: number | undefined = this.doSeizeNumberFromLockFile(pidFileFullPath);

        // check if we need to start the daemon for the first time
        if (typeof pidNumber !== "number" || !pidIsRunning(pidNumber.valueOf())) {
            new SpawnedProcess(
                path.resolve(nextPQTestLocation, PqDaemonClient.ExecutableName),
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
        }

        if (!Number.isInteger(pidNumber)) {
            // pause for effects
            await delay(500);
            // eslint-disable-next-line require-atomic-updates
            pidNumber = this.doSeizeNumberFromLockFile(pidFileFullPath);
        }

        let portNumber: number | undefined = undefined;
        let portInUse: boolean = false;
        let maxTry: number = 5;

        while (maxTry > 0 && !portInUse) {
            // eslint-disable-next-line no-await-in-loop
            await delay(895);
            portNumber = this.doSeizeNumberFromLockFile(portFileFullPath);

            if (typeof portNumber === "number") {
                // eslint-disable-next-line no-await-in-loop
                portInUse = await isPortBusy(portNumber);
            }

            this.outputChannel.appendInfoLine(
                `Check [${maxTry}] whether PqDaemon.exe exported at ${portNumber}, ${portInUse}`,
            );

            maxTry--;
        }

        if (typeof pidNumber === "number" && typeof portNumber === "number") {
            this.disposeCurrentServerTransportTuple();
            this.createServerSocketTransport(portNumber);
        }
    }

    onPowerQueryTestLocationChanged(): void {
        // PQTestLocation getter
        const nextPQTestLocation: string | undefined = ExtensionConfigurations.PQTestLocation;
        const pqDaemonExe: string | undefined = this.resolvePQDaemonPath(nextPQTestLocation);

        if (!pqDaemonExe || !nextPQTestLocation) {
            this.pqTestReady = false;
            this.pqTestLocation = "";
            this.pqTestFullPath = "";
        } else {
            this.pqTestReady = true;
            this.pqTestLocation = nextPQTestLocation;
            this.pqTestFullPath = pqDaemonExe;
            this.outputChannel.appendInfoLine(`PqDaemon.exe found at ${this.pqTestFullPath}`);

            void this.doStartAndListenPqDaemonIfNeeded(nextPQTestLocation);
        }
    }

    dispose(): void {
        for (const oneDisposable of this._disposables) {
            oneDisposable.dispose();
        }

        this.currentExtensionInfos.dispose();
        this.currentCredentials.dispose();
        this.disposeCurrentServerTransportTuple();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private enlistOnePqDaemonTask<T = any>(
        theRequestMessage: PqDaemonRequest,
        options: PqDaemonTask["options"] = {},
    ): Promise<T> {
        const theTask: PqDaemonTask = { request: theRequestMessage, options } as PqDaemonTask;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: Promise<T> = new Promise((resolve: (value: T) => void, reject: (reason?: any) => void) => {
            theTask.resolve = resolve;
            theTask.reject = reject;
        });

        this.pendingTaskMap.set(theRequestMessage.id, theTask);

        // no need to await it
        void this.serverTransportTuple?.writer.write(theRequestMessage);

        return result;
    }

    DeleteCredential(): Promise<GenericResult> {
        if (this.serverTransportTuple) {
            const theRequestMessage: PqDaemonRequest = {
                jsonrpc: JSON_RPC_VERSION,
                id: this.nextSequenceId,
                method: "DeleteCredential",
                params: [
                    {
                        SessionId: this.sessionId,
                        PathToConnector: resolveSubstitutedValues(ExtensionConfigurations.PQTestExtensionFileLocation),
                        AllCredentials: true,
                    },
                ],
            };

            return this.enlistOnePqDaemonTask<GenericResult>(theRequestMessage);
        } else {
            throw new PqDaemonServerNotReady();
        }
    }

    DisplayExtensionInfo(): Promise<ExtensionInfo> {
        if (this.serverTransportTuple) {
            const theRequestMessage: PqDaemonRequest = {
                jsonrpc: JSON_RPC_VERSION,
                id: this.nextSequenceId,
                method: "DisplayExtensionInfo",
                params: [
                    {
                        SessionId: this.sessionId,
                        PathToConnector: resolveSubstitutedValues(ExtensionConfigurations.PQTestExtensionFileLocation),
                    },
                ],
            };

            return this.enlistOnePqDaemonTask<ExtensionInfo>(theRequestMessage, { shouldParsePayload: true });
        } else {
            throw new PqDaemonServerNotReady();
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    GenerateCredentialTemplate(): Promise<any> {
        if (this.serverTransportTuple) {
            const theRequestMessage: PqDaemonRequest = {
                jsonrpc: JSON_RPC_VERSION,
                id: this.nextSequenceId,
                method: "GenerateCredentialTemplate",
                params: [
                    {
                        SessionId: this.sessionId,
                        PathToConnector: resolveSubstitutedValues(ExtensionConfigurations.PQTestExtensionFileLocation),
                        PathToQueryFile: resolveSubstitutedValues(ExtensionConfigurations.PQTestQueryFileLocation),
                    },
                ],
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return this.enlistOnePqDaemonTask<any>(theRequestMessage, { shouldParsePayload: true });
        } else {
            throw new PqDaemonServerNotReady();
        }
    }

    ListCredentials(): Promise<Credential[]> {
        if (this.serverTransportTuple) {
            const theRequestMessage: PqDaemonRequest = {
                jsonrpc: JSON_RPC_VERSION,
                id: this.nextSequenceId,
                method: "ListCredentials",
                params: [
                    {
                        SessionId: this.sessionId,
                    },
                ],
            };

            return this.enlistOnePqDaemonTask<Credential[]>(theRequestMessage);
        } else {
            throw new PqDaemonServerNotReady();
        }
    }

    RefreshCredential(): Promise<GenericResult> {
        if (this.serverTransportTuple) {
            const theRequestMessage: PqDaemonRequest = {
                jsonrpc: JSON_RPC_VERSION,
                id: this.nextSequenceId,
                method: "RefreshCredential",
                params: [
                    {
                        SessionId: this.sessionId,
                        PathToConnector: resolveSubstitutedValues(ExtensionConfigurations.PQTestExtensionFileLocation),
                        PathToQueryFile: resolveSubstitutedValues(ExtensionConfigurations.PQTestQueryFileLocation),
                    },
                ],
            };

            return this.enlistOnePqDaemonTask<GenericResult>(theRequestMessage);
        } else {
            throw new PqDaemonServerNotReady();
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    RunTestBattery(pathToQueryFile: string | undefined): Promise<any> {
        if (this.serverTransportTuple) {
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

            const theRequestMessage: PqDaemonRequest = {
                jsonrpc: JSON_RPC_VERSION,
                id: this.nextSequenceId,
                method: "RunTestBattery",
                params: [
                    {
                        SessionId: this.sessionId,
                        PathToConnector: resolveSubstitutedValues(ExtensionConfigurations.PQTestExtensionFileLocation),
                        PathToQueryFile: pathToQueryFile,
                    },
                ],
            };

            return this.enlistOnePqDaemonTask<GenericResult>(theRequestMessage);
        } else {
            throw new PqDaemonServerNotReady();
        }
    }

    SetCredential(payloadStr: string): Promise<GenericResult> {
        if (this.serverTransportTuple) {
            const theRequestMessage: PqDaemonRequest = {
                jsonrpc: JSON_RPC_VERSION,
                id: this.nextSequenceId,
                method: "RefreshCredential",
                params: [
                    {
                        SessionId: this.sessionId,
                        PathToConnector: resolveSubstitutedValues(ExtensionConfigurations.PQTestExtensionFileLocation),
                        PathToQueryFile: resolveSubstitutedValues(ExtensionConfigurations.PQTestQueryFileLocation),
                        InputTemplateString: payloadStr,
                    },
                ],
            };

            return this.enlistOnePqDaemonTask<GenericResult>(theRequestMessage);
        } else {
            throw new PqDaemonServerNotReady();
        }
    }

    SetCredentialFromCreateAuthState(createAuthState: CreateAuthState): Promise<GenericResult> {
        if (this.serverTransportTuple) {
            const theRequestMessage: PqDaemonRequest = {
                jsonrpc: JSON_RPC_VERSION,
                id: this.nextSequenceId,
                method: "SetCredentialFromCreateAuthState",
                params: [
                    {
                        SessionId: this.sessionId,
                        PathToConnector: resolveSubstitutedValues(ExtensionConfigurations.PQTestExtensionFileLocation),
                        PathToQueryFile: resolveSubstitutedValues(createAuthState.PathToQueryFile),
                        // DataSourceKind: createAuthState.DataSourceKind,
                        AuthenticationKind: createAuthState.AuthenticationKind,
                        TemplateValueKey: createAuthState.$$KEY$$,
                        TemplateValueUsername: createAuthState.$$USERNAME$$,
                        TemplateValuePassword: createAuthState.$$PASSWORD$$,
                    },
                ],
            };

            return this.enlistOnePqDaemonTask<GenericResult>(theRequestMessage);
        } else {
            throw new PqDaemonServerNotReady();
        }
    }

    TestConnection(): Promise<GenericResult> {
        if (this.serverTransportTuple) {
            const theRequestMessage: PqDaemonRequest = {
                jsonrpc: JSON_RPC_VERSION,
                id: this.nextSequenceId,
                method: "TestConnection",
                params: [
                    {
                        SessionId: this.sessionId,
                        PathToConnector: resolveSubstitutedValues(ExtensionConfigurations.PQTestExtensionFileLocation),
                        PathToQueryFile: resolveSubstitutedValues(ExtensionConfigurations.PQTestQueryFileLocation),
                    },
                ],
            };

            return this.enlistOnePqDaemonTask<GenericResult>(theRequestMessage);
        } else {
            throw new PqDaemonServerNotReady();
        }
    }
}

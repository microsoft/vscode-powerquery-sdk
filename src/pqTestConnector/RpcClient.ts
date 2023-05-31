/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as fs from "fs";
import * as path from "path";

import { ChildProcess } from "child_process";
import { EventEmitter } from "events";

import { CLOSED, ERROR, OPEN } from "../common/sockets/SocketClient";
import { defaultBackOff, JsonRpcSocketClient } from "../common/sockets/JsonRpcSocketClient";
import { delay, isPortBusy, pidIsRunning } from "../utils/pids";

import { AnyFunction } from "../common/promises/types";
import { BaseError } from "../common/errors";
import { convertStringToInteger } from "../utils/numbers";
import { IDisposable } from "../common/Disposable";
import type { PqSdkOutputChannelLight } from "../features/PqSdkOutputChannel";
import { SpawnedProcess } from "../common/SpawnedProcess";

export interface RpcRequestParamBase {
    SessionId: string;
    PathToConnector?: string;
    PathToQueryFile?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // [key: string]: any;
}

export enum ResponseStatus {
    Null = 0,
    Acknowledged = 1,
    Success = 2,
    Failure = 3,
}

// renamed from PqServiceHostResponseResult
export interface RpcResponseResult<T = string> {
    SessionId: string;
    Status: ResponseStatus;
    Payload: T;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    InnerException?: any;
}

// renamed from PqServiceHostServerNotReady
export class RpcServerNotReady extends BaseError {
    constructor() {
        super("Cannot connect to the pqServiceHost");
    }
}

// renamed from PqInternalError
export class RpcInternalError extends BaseError {
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

/**
 * The RpcClient Class handles the connection to PQServiceHost
 */
export class RpcClient extends EventEmitter implements IDisposable {
    public static readonly ExecutableName: string = "PQServiceHost.exe";
    public static readonly ExecutablePidLockFileName: string = "PQServiceHost.pid";
    public static readonly ExecutablePortLockFileName: string = "PQServiceHost.port";

    private _isDisposed: boolean = false;

    pqTestReady: boolean = false;
    pqTestLocation: string = "";
    pqTestFullPath: string = "";

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

    public async requestRemoteRpcMethod<P extends RpcRequestParamBase = RpcRequestParamBase>(
        method: string,
        parameters: P[],
        options: {
            shouldParsePayload?: boolean;
        } = {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<any> {
        if (this.jsonRpcSocketClient) {
            const responseResult: RpcResponseResult = (await this.jsonRpcSocketClient.request(
                method,
                parameters,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            )) as RpcResponseResult<any>;

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

                return Promise.reject(new RpcInternalError(errorMessage, errorData));
            }
        } else {
            throw new RpcServerNotReady();
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
                    if (!this._isDisposed) {
                        this.onPowerQueryTestLocationChangedByConfig(this.currentConfigs);
                    }
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

        const pqServiceHostExe: string = path.resolve(nextPQTestLocation, RpcClient.ExecutableName);

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
            // since we are about to start the pqServiceHost, this client is definitely not disposed.
            this._isDisposed = false;
            this.doStartAndListenPqServiceHostIfNeededInProgress = true;

            const pidFileFullPath: string = path.resolve(nextPQTestLocation, RpcClient.ExecutablePidLockFileName);

            const portFileFullPath: string = path.resolve(nextPQTestLocation, RpcClient.ExecutablePortLockFileName);

            let pidNumber: number | undefined = this.doSeizeNumberFromLockFile(pidFileFullPath);

            // check if we need to start the pqServiceHost for the first time
            if (typeof pidNumber !== "number" || !pidIsRunning(pidNumber.valueOf())) {
                // pause a little while to enlarge the chances that other service hosts fully shutdown
                await delay(250);

                new SpawnedProcess(
                    path.resolve(nextPQTestLocation, RpcClient.ExecutableName),
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

    private currentConfigs: { PQTestLocation: string | undefined } = { PQTestLocation: undefined };
    /**
     * Event handler of the PQSdkTool folder change event
     * And it could also act as the init event consumer for a new connection
     * @param configs the configs of a getter PQTestLocation returning
     * the folder containing the executable like:
     *      D:\Repo\PowerQuerySdkTools\out\AnyCPU\Release\SdkTools\tools
     */
    public onPowerQueryTestLocationChangedByConfig(configs: typeof this.currentConfigs): void {
        this.currentConfigs = configs;
        // PQTestLocation getter
        const nextPQTestLocation: string | undefined = configs.PQTestLocation;

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
        this._isDisposed = true;

        for (const oneDisposable of this._disposables) {
            oneDisposable.dispose();
        }

        this.disposeCurrentJsonRpcSocketClient();
    }
}

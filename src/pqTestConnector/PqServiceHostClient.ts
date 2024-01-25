/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as vscode from "vscode";

import { Credential, ExtensionInfo, IPQTestService } from "../common/PQTestService";
import { GlobalEventBus, GlobalEvents } from "../GlobalEventBus";
import {
    PqServiceHostClientLite,
    PqServiceHostRequestParamBase,
    PqServiceHostResponseResult,
} from "./PqServiceHostClientLite";
import { IDisposable } from "../common/Disposable";
import { PqSdkOutputChannel } from "../features/PqSdkOutputChannel";
import { ValueEventEmitter } from "../common/ValueEventEmitter";

export * from "./PqServiceHostClientLite";

export class PqServiceHostClient extends PqServiceHostClientLite implements IPQTestService, IDisposable {
    private pingTimer: NodeJS.Timeout | undefined = undefined;

    public override get pqServiceHostConnected(): boolean {
        return Boolean(this.pingTimer);
    }

    public readonly currentExtensionInfos: ValueEventEmitter<ExtensionInfo[]> = new ValueEventEmitter<ExtensionInfo[]>(
        [],
    );
    public readonly currentCredentials: ValueEventEmitter<Credential[]> = new ValueEventEmitter<Credential[]>([]);

    constructor(private readonly globalEventBus: GlobalEventBus, outputChannel: PqSdkOutputChannel) {
        super(outputChannel);

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

    protected override onConnected(): void {
        this.startToSendPingMessages();
    }

    protected override onDisconnecting(): void {
        this.stopSendingPingMessages();
    }

    protected override onReconnecting(): void {
        // we have already been listening to a service host
        if (this.pingTimer) {
            // there would only one single host expected running per machine
            // thus, we need to shut the existing one down first
            void this.ForceShutdown();
            // and clear the ping interval handler
            this.stopSendingPingMessages();
        }
    }

    public override async requestRemoteRpcMethod<
        P extends PqServiceHostRequestParamBase = PqServiceHostRequestParamBase,
    >(
        method: string,
        parameters: P[],
        options: {
            shouldParsePayload?: boolean;
        } = {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<any> {
        const responseResultPayload: PqServiceHostResponseResult["Payload"] = await super.requestRemoteRpcMethod(
            method,
            parameters,
            options,
        );

        if (method === "v1/PqTestService/DisplayExtensionInfo") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.currentExtensionInfos.emit(responseResultPayload as any);
        } else if (method === "v1/PqTestService/ListCredentials") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.currentCredentials.emit(responseResultPayload as any);
        }

        return responseResultPayload;
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

    public override dispose(): void {
        this.currentExtensionInfos.dispose();
        this.currentCredentials.dispose();
        super.dispose();
    }

    ForceShutdown(): Promise<number> {
        return this.requestRemoteRpcMethod("v1/HealthService/Shutdown", [
            {
                SessionId: this.sessionId,
            },
        ]);
    }

    Ping(): Promise<number> {
        return this.requestRemoteRpcMethod("v1/HealthService/Ping", [
            {
                SessionId: this.sessionId,
            },
        ]);
    }
}

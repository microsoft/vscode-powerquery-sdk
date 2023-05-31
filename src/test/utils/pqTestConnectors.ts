/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as path from "path";
import { EventEmitter } from "events";
import { expect } from "chai";
import { GenericResult } from "../../common/PQTestService";

import { DISCONNECTED, READY, RpcClient } from "../../pqTestConnector/RpcClient";
import { delay } from "../../utils/pids";
import { fromEvents } from "../../common/promises/fromEvents";
import type { PqSdkOutputChannelLight } from "../../features/PqSdkOutputChannel";

export module PqTestConnectors {
    export class E2EPqTestClient extends RpcClient {
        public readonly pqUIFlowEvent: EventEmitter = new EventEmitter();

        constructor(outputChannel: PqSdkOutputChannelLight) {
            super(outputChannel);
        }

        subscribeNotificationEventEmitter(): void {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.jsonRpcSocketClient?.notificationMessageEmitter.on("PqFlowEvent", (pqFlowBaseEvent: any) => {
                this.pqUIFlowEvent.emit(pqFlowBaseEvent.Method, pqFlowBaseEvent);
            });
        }

        RegisterDebuggerListener(sessionId: string = "DefaultSession"): Promise<number> {
            return this.requestRemoteRpcMethod("v1/E2ETestHelperService/RegisterDebuggerListener", [
                {
                    SessionId: sessionId,
                },
            ]);
        }

        DeregisterDebuggerListener(sessionId: string = "DefaultSession"): Promise<number> {
            return this.requestRemoteRpcMethod("v1/E2ETestHelperService/DeregisterDebuggerListener", [
                {
                    SessionId: sessionId,
                },
            ]);
        }

        CancelAllOpenedWebview(sessionId: string = "DefaultSession"): Promise<number> {
            return this.requestRemoteRpcMethod("v1/E2ETestHelperService/CancelAllOpenedWebview", [
                {
                    SessionId: sessionId,
                },
            ]);
        }

        SetDefaultAnonymousCredentialByPath(
            pathToConnectorProject: string,
            connectorName: string,
            sessionId: string = "DefaultSession",
        ): Promise<GenericResult> {
            return this.requestRemoteRpcMethod("v1/PqTestService/SetCredentialFromCreateAuthState", [
                {
                    SessionId: sessionId,
                    PathToConnector: path.join(
                        pathToConnectorProject,
                        "bin",
                        "AnyCPU",
                        "Debug",
                        `${connectorName}.mez`,
                    ),
                    PathToQueryFile: path.join(pathToConnectorProject, `${connectorName}.query.pq`),
                    AuthenticationKind: "Anonymous",
                },
            ]);
        }
    }

    export async function createPqServiceHostClientLiteAndConnect(pqSdkToolFullPath: string): Promise<E2EPqTestClient> {
        const theClient: E2EPqTestClient = new E2EPqTestClient({
            appendInfoLine(value: string): void {
                // these console logs are harmless and were merely used within e2e tests
                console.log(`[E2E_PQServiceHostList::Info] ${value}`);
            },
            appendErrorLine(value: string): void {
                // these console logs are harmless and were merely used within e2e tests
                console.log(`[E2E_PQServiceHostList::Error] ${value}`);
            },
        });

        // subscribe READY event first before starting the pqServiceHost
        const connectedPromise: Promise<unknown> = fromEvents(theClient, [READY], [DISCONNECTED]);

        // pause few sec to let vsc sdk ext boot pqServiceHost
        await delay(3e3);

        theClient.onPowerQueryTestLocationChangedByConfig({ PQTestLocation: pqSdkToolFullPath });

        await connectedPromise;

        expect(
            theClient.pqServiceHostConnected,
            "E2E_PQServiceHostLite should have connected to the running pqServiceHost but it was not",
        ).to.be.true;

        theClient.subscribeNotificationEventEmitter();

        return theClient;
    }
}

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

/* eslint-disable prefer-rest-params, no-invalid-this */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { MethodNotFound } from "json-rpc-protocol";
import { URL } from "url";
import WebSocket from "ws";

import { CLOSED, ConnectionError, MESSAGE, WebSocketClient } from "./WebSocketClient";
import { fibonacciNumbers } from "../iterables/FibonacciNumbers";
import { JsonRpcHelper } from "./JsonRpcHelper";
import { NumberGenerator } from "../iterables/NumberIterator";

export { ConnectionError } from "./WebSocketClient";

export const defaultBackOff: NumberGenerator = (tries: number = 10) => fibonacciNumbers().addNoise().toMs().take(tries);

export class JsonRpcWebSocketClient extends WebSocketClient {
    private readonly jsonRpcHelper: JsonRpcHelper;

    constructor(address: string | URL, protocols?: string | string[], options?: WebSocket.ClientOptions) {
        super(address, protocols, options);

        this.jsonRpcHelper = new JsonRpcHelper((message: any, data?: any) => {
            if (message.type !== "notification") {
                throw new MethodNotFound();
            }

            this.emit("notification", message, data);
        });

        this.jsonRpcHelper.on("data", (message: any) => {
            this.send(message);
        });

        this.on(CLOSED, () => {
            this.jsonRpcHelper.failPendingRequests(new ConnectionError("Connection has been closed"));
        });

        this.on(MESSAGE, (message: WebSocket.MessageEvent) => {
            this.jsonRpcHelper.write(message.data);
        });
    }

    public call(method: string, params: unknown[] = []): Promise<any> {
        return this.jsonRpcHelper.request(method, params);
    }

    public notify(method: string, params: unknown[]): void {
        return this.jsonRpcHelper.notify(method, params);
    }
}

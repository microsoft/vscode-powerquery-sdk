/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

/* eslint-disable prefer-rest-params, no-invalid-this */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
    Message,
    RequestMessage,
    ResponseMessage,
    SocketMessageReader,
    SocketMessageWriter,
} from "vscode-jsonrpc/node";
import { fibonacciNumbers } from "../iterables/FibonacciNumbers";
import { NumberGenerator } from "../iterables/NumberIterator";

import { CLOSED, OPEN, SocketClient, SocketConnectionError } from "./SocketClient";
import { AnyFunction } from "../promises/types";
import { BaseError } from "../errors";
import { noop } from "../promises/noop";

const JSON_RPC_VERSION: string = "2.0";

export const defaultBackOff: NumberGenerator = (tries: number = 5) => fibonacciNumbers().addNoise().toMs().take(tries);

export interface RequestBase<T = unknown> extends RequestMessage {
    /**
     * The request id.
     */
    id: number;
    /**
     * The method to be invoked.
     */
    method: string;
    /**
     * The method's params.
     */
    params: [T];
}

export type NotificationBase<T = unknown> = Omit<RequestBase<T>, "id">;

export interface ResponseBase extends ResponseMessage {
    id: number;
}

let nextRequestId: number = -9007199254740990;

function makeAsync<T extends AnyFunction>(fn: T): (...args: Parameters<T>) => Promise<ReturnType<T>> {
    return function (this: any) {
        return new Promise((resolve: AnyFunction) => resolve(fn.apply(this, [...arguments])));
    } as unknown as (...args: Parameters<T>) => Promise<ReturnType<T>>;
}

export class JsonRpcMethodNotFound extends BaseError {
    public readonly jsonRpcMessage: any;

    constructor(message: string, jsonRpcMessage: any) {
        super(message);
        this.jsonRpcMessage = jsonRpcMessage;
    }
}

// Default onMessage implementation:
//
// - ignores notifications
// - throw MethodNotFound for all requests
function defaultOnMessage(message: any): void {
    if (message.type === "request") {
        throw new JsonRpcMethodNotFound(message.method, message);
    }
}

export type DeferredJsonRpcTask = { resolve: AnyFunction; reject: AnyFunction };

export class JsonRpcSocketClient extends SocketClient {
    private readonly _handle: (message: any) => Promise<any>;
    private readonly _deferredDictionary: Map<number, DeferredJsonRpcTask> = new Map();
    private reader?: SocketMessageReader;
    private writer?: SocketMessageWriter;

    constructor(port: number, host: string = "127.0.0.1", onMessage: (message: any) => void = defaultOnMessage) {
        super(port, host);

        this._handle = makeAsync(onMessage);

        this.on(OPEN, () => {
            if (!this.socket) {
                throw new SocketConnectionError("Socket connection not found");
            }

            this.reader = new SocketMessageReader(this.socket, "utf-8");
            this.writer = new SocketMessageWriter(this.socket, "utf-8");

            this.reader.listen((message: Message) => {
                void this.exec(message);
            });
        });

        this.on(CLOSED, () => {
            this.failPendingRequests(new SocketConnectionError("Connection has been closed"));
        });
    }

    public exec(rawJsonRpcMessage: Message): Promise<any> {
        if (Message.isResponse(rawJsonRpcMessage)) {
            const rawJsonRpcResponseMessage: ResponseBase = rawJsonRpcMessage as ResponseBase;

            if (rawJsonRpcMessage.error) {
                return this._getDeferred(rawJsonRpcResponseMessage.id)?.reject(rawJsonRpcResponseMessage.error);
            }

            return this._getDeferred(rawJsonRpcResponseMessage.id)?.resolve(rawJsonRpcResponseMessage.result);
        } else if (Message.isNotification(rawJsonRpcMessage)) {
            return this._handle(rawJsonRpcMessage).catch(noop);
        } else {
            return this._handle(rawJsonRpcMessage).then((result: ResponseBase) => result.result);
        }
    }

    public failPendingRequests(reason: any): void {
        const deferredDictionary: Map<number, DeferredJsonRpcTask> = this._deferredDictionary;

        deferredDictionary.forEach((deferredJsonRpcTask: DeferredJsonRpcTask) => {
            deferredJsonRpcTask.reject(reason);
        });

        deferredDictionary.clear();
    }

    public write(message: Message): boolean {
        if (!this.writer) {
            // reject all the unresolved promise so far
            this.emit(CLOSED);

            return false;
        }

        void this.writer.write(message);

        return true;
    }

    public request(method: string, params: any[] = []): Promise<any> {
        return new Promise((resolve: AnyFunction, reject: AnyFunction) => {
            const requestId: number = nextRequestId++;
            this._deferredDictionary.set(requestId, { resolve, reject });

            this.write({ jsonrpc: JSON_RPC_VERSION, id: requestId, method, params } as RequestBase);
        });
    }

    public notify(method: string, params: any[]): void {
        this.write({ jsonrpc: JSON_RPC_VERSION, method, params } as NotificationBase);
    }

    private _getDeferred(id: number): DeferredJsonRpcTask | undefined {
        const deferred: DeferredJsonRpcTask | undefined = this._deferredDictionary.get(id);

        if (deferred) {
            this._deferredDictionary.delete(id);
        }

        return deferred;
    }
}

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

/* eslint-disable prefer-rest-params, no-invalid-this */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { format, JsonRpcError, MethodNotFound, parse } from "json-rpc-protocol";
import { EventEmitter } from "events";

import { AnyFunction } from "../promises/types";
import { noop } from "../promises/noop";
import WritableStream = NodeJS.WritableStream;

let nextRequestId: number = -9007199254740990;

function makeAsync<T extends AnyFunction>(fn: T): (...args: Parameters<T>) => Promise<ReturnType<T>> {
    return function (this: any) {
        return new Promise((resolve: AnyFunction) => resolve(fn.apply(this, [...arguments])));
    } as unknown as (...args: Parameters<T>) => Promise<ReturnType<T>>;
}

export type JsonRpcParsedMessage = ReturnType<typeof parse>;

const parseMessage: (message: any) => JsonRpcParsedMessage = (message: any) => {
    try {
        return parse(message);
    } catch (error) {
        throw format.error(null, error);
    }
};

// Default onMessage implementation:
//
// - ignores notifications
// - throw MethodNotFound for all requests
function defaultOnMessage(message: any): void {
    if (message.type === "request") {
        throw new MethodNotFound(message.method);
    }
}

export type DeferredJsonRpcTask = { resolve: AnyFunction; reject: AnyFunction };

export class JsonRpcHelper extends EventEmitter {
    private readonly _asyncEmitError: AnyFunction = process.nextTick.bind(process, this.emit.bind(this), "error");
    private readonly _handle: (message: any, data?: any) => Promise<any>;
    private readonly _deferredDictionary: Map<number, DeferredJsonRpcTask> = new Map();

    constructor(onMessage: (message: any, data?: any) => void = defaultOnMessage) {
        super();

        this._handle = makeAsync(onMessage);
    }

    public async exec(rawMessage: any, data?: any): Promise<any> {
        const message: any = parseMessage(rawMessage);

        if (Array.isArray(message)) {
            const results: any[] = [];

            // Only returns non-empty results.
            await Promise.all(
                message.map((oneMessage: any) =>
                    this.exec(oneMessage, data).then((result: any) => {
                        if (result !== undefined) {
                            results.push(result);
                        }
                    }),
                ),
            );

            return results;
        }

        const type: string = message.type;

        if (type === "error") {
            const id: number | null = message.id;

            // Some errors do not have an identifier, simply discard them.
            if (id === null) {
                return;
            }

            const error: any = message.error;

            this._getDeferred(id)?.reject(
                // TODO: it would be great if we could return an error with of
                // a more specific type (and custom types with registration).
                new JsonRpcError(error.message, error.code, error.data),
            );
        } else if (type === "response") {
            this._getDeferred(message.id)?.resolve(message.result);
        } else if (type === "notification") {
            this._handle(message, data).catch(noop);
        } else {
            return this._handle(message, data)
                .then((result: any) => format.response(message.id, result ?? null))
                .catch((error: any) =>
                    format.error(
                        message.id,

                        // If the method name is not defined, default to the method passed
                        // in the request.
                        error instanceof MethodNotFound && !error.data ? new MethodNotFound(message.method) : error,
                    ),
                );
        }
    }

    public failPendingRequests(reason: any): void {
        const deferredDictionary: Map<number, DeferredJsonRpcTask> = this._deferredDictionary;

        deferredDictionary.forEach((deferredJsonRpcTask: DeferredJsonRpcTask) => {
            deferredJsonRpcTask.reject(reason);
        });

        deferredDictionary.clear();
    }

    public push(data: any): boolean {
        return data === null ? this.emit("end") : this.emit("data", data);
    }

    public request(method: string, params: any[]): Promise<any> {
        return new Promise((resolve: AnyFunction, reject: AnyFunction) => {
            const requestId: number = nextRequestId++;

            this.push(format.request(requestId, method, params));

            this._deferredDictionary.set(requestId, { resolve, reject });
        });
    }

    public notify(method: string, params: any[]): void {
        this.push(format.notification(method, params));
    }

    end(data: any, encoding: AnyFunction, cb: AnyFunction): void {
        if (typeof data === "function") {
            process.nextTick(data);
        } else {
            if (typeof encoding === "function") {
                process.nextTick(encoding);
            } else if (typeof cb === "function") {
                process.nextTick(cb);
            }

            if (data !== undefined) {
                this.write(data);
            }
        }
    }

    public write(message: any): boolean {
        let cb: AnyFunction;
        const n: number = arguments.length;

        if (n > 1 && typeof (cb = arguments[n - 1]) === "function") {
            process.nextTick(cb);
        }

        this.exec(String(message)).then(
            (response: any) => {
                if (response !== undefined) {
                    this.push(response);
                }
            },
            (error: any) => {
                this._asyncEmitError(error);
            },
        );

        // indicates that other calls to `write` are allowed
        return true;
    }

    public pipe(writable: WritableStream): WritableStream {
        const listeners: Array<[string, AnyFunction]> = [
            ["data", (data: any): boolean => writable.write(data)],
            [
                "end",
                (): void => {
                    writable.end();
                    clean();
                },
            ],
        ];

        const clean = (): void =>
            listeners.forEach(([eventName, listener]: [string, AnyFunction]) => {
                this.removeListener(eventName, listener);
            });

        listeners.forEach(([eventName, listener]: [string, AnyFunction]) => {
            this.on(eventName, listener);
        });

        return writable;
    }

    private _getDeferred(id: number): DeferredJsonRpcTask | undefined {
        const deferred: DeferredJsonRpcTask | undefined = this._deferredDictionary.get(id);

        if (deferred) {
            this._deferredDictionary.delete(id);
        }

        return deferred;
    }
}

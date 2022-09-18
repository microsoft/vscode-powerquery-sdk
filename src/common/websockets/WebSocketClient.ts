/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { EventEmitter } from "events";
import { URL } from "url";
import WebSocket from "ws";

import { NumberGenerator, NumberIterator } from "../iterables/NumberIterator";
import { promisifyTry } from "../promises/promisifyTry";

import { BaseError } from "../errors";
import { delay } from "../../utils/pids";
import { fromEvent } from "../promises/fromEvent";
import { fromEvents } from "../promises/fromEvents";

export class ConnectionError extends BaseError {}
export class AbortedConnection extends ConnectionError {
    constructor() {
        super("Connection aborted");
    }
}

// eslint-disable-next-line @typescript-eslint/typedef
export const CLOSED = "closed" as const;
// eslint-disable-next-line @typescript-eslint/typedef
export const CONNECTING = "connecting" as const;
// eslint-disable-next-line @typescript-eslint/typedef
export const MESSAGE = "message" as const;
// eslint-disable-next-line @typescript-eslint/typedef
export const OPEN = "open" as const;

export type StatusType = "closed" | "connecting" | "message" | "open";

export type WebSocketExtended = WebSocket & { abort?: boolean };

export class WebSocketClient extends EventEmitter {
    private _status: StatusType = "closed";
    private _socket: WebSocketExtended | undefined = undefined;

    constructor(
        private readonly address: string | URL,
        private readonly protocols?: string | string[],
        private readonly options?: WebSocket.ClientOptions,
    ) {
        super();

        if (options && !address.toString().startsWith("wss")) {
            delete options.rejectUnauthorized;
        }
    }

    get status(): StatusType {
        return this._status;
    }

    close(): Promise<void> {
        return promisifyTry(() => {
            const status: StatusType = this._status;

            if (status === CLOSED) {
                return;
            }

            const currentSocket: WebSocketExtended | undefined = this._socket;

            if (!currentSocket) {
                return;
            }

            if (status === CONNECTING) {
                currentSocket.abort = true;
                currentSocket.close();

                return;
            }

            const promise: Promise<void> = fromEvent(currentSocket, "close");
            currentSocket.close();

            return promise;
        }) as Promise<void>;
    }

    open(backOffGenerator?: NumberGenerator): Promise<void> {
        if (!backOffGenerator) {
            return this._open();
        }

        const theNumberIterator: NumberIterator = backOffGenerator();

        let __cancelled: boolean = false;

        const cancel = (): void => {
            __cancelled = true;
        };

        let __error: any;

        const attempt = (): Promise<void> => {
            if (__cancelled) {
                throw __error;
            }

            return this._open().catch((reason: any) => {
                let current: IteratorResult<number, undefined>;

                if (reason instanceof AbortedConnection || (current = theNumberIterator.next()).done) {
                    throw reason;
                }

                const value: number = current.value;

                this.emit("scheduledAttempt", { cancel, delay: value });

                __error = reason;

                return delay(value).then(attempt);
            });
        };

        const result: Promise<void> = attempt();
        (result as any).cancel = cancel;

        return result;
    }

    send(data: any): void {
        this._assertStatus(OPEN);
        this._socket?.send(data);
    }

    private _assertStatus(expected: StatusType): void {
        if (this._status !== expected) {
            throw new ConnectionError(`invalid status ${this._status}, expected ${expected}`);
        }
    }

    private _onClose: (event: WebSocket.CloseEvent) => void = (event: WebSocket.CloseEvent) => {
        const previousStatus: StatusType = this._status;

        this._socket = undefined;
        this._status = CLOSED;

        if (previousStatus === OPEN) {
            this.emit(CLOSED, event);
        }
    };

    private _onError: (event: WebSocket.ErrorEvent) => void = (error: WebSocket.ErrorEvent) => {
        this.emit("error", error);
    };

    private _onMessage: (event: WebSocket.MessageEvent) => void = (event: WebSocket.MessageEvent) => {
        this.emit(MESSAGE, event);
    };

    private _open: () => Promise<void> = () =>
        promisifyTry(() => {
            this._assertStatus(CLOSED);
            this._status = CONNECTING;

            return promisifyTry(() => {
                const socket: WebSocket = new WebSocket(this.address, this.protocols, this.options);
                this._socket = socket;

                return fromEvents(socket, ["open"], ["close", "error"]).then(
                    () => {
                        socket.addEventListener("close", this._onClose);
                        socket.addEventListener("error", this._onError);
                        socket.addEventListener("message", this._onMessage);
                        this._status = OPEN;
                        this.emit(OPEN);
                    },
                    ([error]: any[]) => {
                        if ((socket as any).abort) {
                            throw new AbortedConnection();
                        }

                        throw error;
                    },
                );
            });
        }) as unknown as Promise<void>;
}

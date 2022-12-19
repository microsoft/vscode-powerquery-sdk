/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createConnection, Socket } from "net";
import { EventEmitter } from "events";

import { NumberGenerator, NumberIterator } from "../iterables/NumberIterator";
import { promisifyTry } from "../promises/promisifyTry";

import { BaseError } from "../errors";
import { delay } from "../../utils/pids";
import { fromEvent } from "../promises/fromEvent";
import { fromEvents } from "../promises/fromEvents";

export class SocketConnectionError extends BaseError {}
export class SocketAbortedConnection extends SocketConnectionError {
    constructor() {
        super("Tcp socket connection aborted");
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
// eslint-disable-next-line @typescript-eslint/typedef
export const ERROR = "error" as const;

export type StatusType = "closed" | "connecting" | "open";

export type SocketExtended = Socket & { abort?: boolean };

export class SocketClient extends EventEmitter {
    private _status: StatusType = "closed";
    private _socket: SocketExtended | undefined = undefined;

    constructor(private readonly port: number, private readonly host: string) {
        super();
    }

    get status(): StatusType {
        return this._status;
    }

    get socket(): Socket | undefined {
        return this._socket;
    }

    close(): Promise<void> {
        return promisifyTry(() => {
            const status: StatusType = this._status;

            if (status === CLOSED) {
                return;
            }

            const currentSocket: SocketExtended | undefined = this._socket;

            if (!currentSocket) {
                return;
            }

            if (status === CONNECTING) {
                currentSocket.abort = true;
                currentSocket.destroy();

                return;
            }

            const promise: Promise<void> = fromEvent(currentSocket, "close");
            currentSocket.destroy();

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

                if (reason instanceof SocketAbortedConnection || (current = theNumberIterator.next()).done) {
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
        this._socket?.write(data);
    }

    private _assertStatus(expected: StatusType): void {
        if (this._status !== expected) {
            throw new SocketConnectionError(`invalid status ${this._status}, expected ${expected}`);
        }
    }

    private _onClose: (hadError: boolean) => void = (hadError: boolean) => {
        const previousStatus: StatusType = this._status;

        this._socket = undefined;
        this._status = CLOSED;

        if (previousStatus === OPEN) {
            this.emit(CLOSED, hadError);
        }
    };

    private _onError: (event: Error) => void = (error: Error) => {
        this.emit(ERROR, error);
    };

    private _onMessage: (...args: any[]) => void = (...args: any[]) => {
        this.emit(MESSAGE, ...args);
    };

    private _open: () => Promise<void> = () =>
        promisifyTry(() => {
            this._assertStatus(CLOSED);
            this._status = CONNECTING;

            return promisifyTry(() => {
                const socket: Socket = createConnection(this.port, this.host);
                this._socket = socket;
                this._socket.setTimeout(0);
                this._socket.setKeepAlive(true);

                return fromEvents(socket, ["connect"], ["close", "error"]).then(
                    () => {
                        socket.on("close", this._onClose);
                        socket.on("error", this._onError);
                        socket.on("message", this._onMessage);
                        this._status = OPEN;
                        this.emit(OPEN);
                    },
                    ([error]: any[]) => {
                        if ((socket as any).abort) {
                            throw new SocketAbortedConnection();
                        }

                        throw error;
                    },
                );
            });
        }) as unknown as Promise<void>;
}

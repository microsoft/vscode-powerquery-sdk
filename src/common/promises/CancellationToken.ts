/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import type { CancellationToken as IVscCancellationToken } from "vscode";

import { AnyFunction, BasicEvent } from "./types";
import { defer, DeferredResult } from "./defer";

import { $$toStringTag } from "./symbols";
import { BaseError } from "../errors";
import { isPromise } from "./isPromise";
import { noop } from "./noop";

export type CancelAction = (message: string | Cancel) => void;

// eslint-disable-next-line @typescript-eslint/typedef
const cancellationTokenTag = "CancellationToken" as const;

const InternalActionGetter: (action: CancelAction) => void = (_action: CancelAction) => {
    // noop
};

type InternalHandler = AnyFunction & { listener: AnyFunction | { handleEvent: AnyFunction } };

export class Cancel extends BaseError {
    // private readonly message: string;

    constructor(message: string = "this action has been canceled") {
        super(message);
    }
}

export class CancellationToken implements IVscCancellationToken {
    static readonly none: CancellationToken = new CancellationToken(InternalActionGetter);
    static readonly canceled: CancellationToken = new CancellationToken(InternalActionGetter);

    static activateInternalTokens(): void {
        void this.canceled.doCancel("canceled");

        const none: Cancel = new Cancel("none");
        this.none.addHandler(() => noop);
        this.none._promise = Promise.resolve(none);
    }

    static isCancellationToken(value: { [index: string | symbol]: unknown } | CancellationToken): boolean {
        return (
            Boolean(value) && (value as { [index: string | symbol]: unknown })[$$toStringTag] === cancellationTokenTag
        );
    }

    static from(value: { [index: string | symbol]: unknown } | AbortSignal): CancellationToken {
        if (this.isCancellationToken(value as { [index: string | symbol]: unknown })) {
            return value as CancellationToken;
        }

        // todo what!!!, nodeJs.AbortSignal missed onabort ??!! add it to global.d.ts
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const abortSignal: any = value as any;
        // const abortSignal: AbortSignal = value as AbortSignal;

        const token: CancellationToken = new CancellationToken(InternalActionGetter);

        abortSignal.onabort = (): void => {
            void token.doCancel(abortSignal.reason ?? "Aborted");
        };

        return token;
    }

    private _handlers: AnyFunction[] | undefined = undefined;
    private _reason: Cancel | undefined;
    private _promise: Promise<Cancel> | undefined;
    private _resolve: ((value: Cancel) => void) | undefined;
    public onAbort: AnyFunction | undefined;
    public onCancellationRequested: AnyFunction = noop;

    constructor(cancelActionGetter: (action: CancelAction) => void = InternalActionGetter) {
        if (cancelActionGetter !== InternalActionGetter) {
            cancelActionGetter(this.doCancel.bind(this));
        }
    }

    get reason(): Cancel | undefined {
        return this._reason;
    }

    get requested(): boolean {
        return this._reason !== undefined;
    }

    get aborted(): boolean {
        return this.requested;
    }

    get isCancellationRequested(): boolean {
        return this.requested;
    }

    get promise(): Promise<Cancel> {
        if (!this._promise) {
            if (this._reason) {
                this._promise = Promise.resolve(this._reason);
            } else {
                this._promise = new Promise<Cancel>((resolve: (cancel: Cancel) => void) => {
                    this._resolve = resolve;
                });
            }
        }

        return this._promise as Promise<Cancel>;
    }

    public addHandler(handler: AnyFunction): (handler: AnyFunction) => void {
        if (!Array.isArray(this._handlers)) {
            if (this.requested) {
                throw new TypeError("cannot add a handler to an already canceled token");
            }

            this._handlers = [];
        }

        this._handlers.push(handler);

        return this.removeHandler.bind(this, handler);
    }

    private removeHandler(handler: AnyFunction): void {
        if (this._handlers && this._handlers.length) {
            const maybeHandlerIndex: number = this._handlers.indexOf(handler);

            if (maybeHandlerIndex !== -1) {
                this._handlers.splice(maybeHandlerIndex, 1);
            }
        }
    }

    public throwIfRequested(): void {
        if (this._reason) {
            throw this._reason;
        }
    }

    get [$$toStringTag](): typeof cancellationTokenTag {
        return cancellationTokenTag;
    }

    public addEventListener(type: string, listener: AnyFunction | { handleEvent: AnyFunction }): void {
        if (type !== "abort") {
            return;
        }

        const event: BasicEvent = { type: "abort" };

        const handler: AnyFunction =
            typeof listener === "function" ? (): void => listener(event) : (): void => listener.handleEvent(event);

        // save the listener reference for removing
        (handler as InternalHandler).listener = listener;

        this.addHandler(handler);
    }

    public removeEventListener(type: string, listener: AnyFunction | { handleEvent: AnyFunction }): void {
        if (type !== "abort") {
            return;
        }

        if (this._handlers) {
            const indexToRemove: number = this._handlers.findIndex(
                (internalHandler: AnyFunction) => (internalHandler as InternalHandler).listener === listener,
            );

            if (indexToRemove !== -1) {
                this._handlers.splice(indexToRemove, 1);
            }
        }
    }

    public dependsOn(others: CancellationToken[]): void {
        for (const other of others) {
            const { reason }: CancellationToken = other;

            if (reason) {
                void this.doCancel(reason);

                return;
            }

            other.addHandler(this.doCancel.bind(this));
        }
    }

    private doCancel(message: string | Cancel): Promise<void> {
        if (this._reason) {
            // it has already been cancelled
            return Promise.resolve();
        }

        this._reason =
            // eslint-disable-next-line no-nested-ternary
            message instanceof Cancel
                ? message
                : typeof message === "string"
                ? new Cancel(message)
                : new Cancel("Unknown aborted reason");

        // if we got _resolve handler of the cancellation, invoke it
        if (this._resolve) {
            const theResolve: ((value: Cancel) => void) | undefined = this._resolve;
            this._resolve = undefined;
            theResolve(this._reason);
        }

        // if we got onAbort event emitter
        if (this.onAbort) {
            this.onAbort();
        }

        // if we got onAbort event emitter
        if (this.onCancellationRequested !== noop) {
            this.onCancellationRequested(this._reason);
        }

        const currentHandlers: AnyFunction[] | undefined = this._handlers;

        // clear all the pending handler if any
        // and if there were any handler returning a promise,
        // we need a wait count to ensure all those promise got resolved
        if (currentHandlers) {
            this._handlers = undefined;

            const { promise, resolve }: DeferredResult<void> = defer<void>();
            let wait: number = 0;

            const onSettled: () => void = () => {
                if (--wait === 0) {
                    return resolve();
                }
            };

            for (const oneHandler of currentHandlers) {
                try {
                    const result: unknown = oneHandler(this._reason);

                    if (isPromise(result)) {
                        ++wait;
                        (result as Promise<unknown>).then(onSettled, onSettled);
                    }
                } catch (_) {
                    // noop
                }
            }

            if (wait !== 0) {
                return promise;
            }
        }

        // if not, directly return one resolved promise
        return Promise.resolve();
    }
}

export class CancellationTokenSource {
    public token: CancellationToken;
    public cancel: CancelAction;
    constructor(dependents: CancellationToken[] = []) {
        this.cancel = (_: string | Cancel): void => {
            // noop
        };

        this.token = new CancellationToken((action: CancelAction) => {
            this.cancel = action;
        });

        if (dependents.length) {
            this.token.dependsOn(dependents);
        }
    }
}

CancellationToken.activateInternalTokens();

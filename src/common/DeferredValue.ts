/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

type ResolveHandler<T> = (value: T | PromiseLike<T>) => void;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RejectHandler = (reason: any) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class DeferredValue<T = any> {
    public readonly deferred$: Promise<T>;
    private _value: T;
    private _resolve: ResolveHandler<T> | undefined = undefined;
    private _reject: RejectHandler | undefined = undefined;
    private _timeoutHandler: NodeJS.Timeout | undefined = undefined;

    private cleanUpHandlers(): void {
        this._resolve = undefined;
        this._resolve = undefined;

        if (this._timeoutHandler) {
            clearTimeout(this._timeoutHandler);
            this._timeoutHandler = undefined;
        }
    }

    public resolve(value: T): void {
        if (this._resolve) {
            this._resolve(value);
            this.cleanUpHandlers();
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public reject(reason: any): void {
        if (this._reject) {
            this._reject(reason);
            this.cleanUpHandlers();
        }
    }

    get value(): T {
        return this._value;
    }

    set value(val: T) {
        if (this.resolve) {
            this._value = val;
            this.resolve(val);
        }
    }

    constructor(initValue: T, timeout: number = 0) {
        this._value = initValue;

        this.deferred$ = new Promise((resolve: ResolveHandler<T>, reject: RejectHandler) => {
            this.resolve = resolve;
            this.reject = reject;
        });

        if (timeout) {
            this._timeoutHandler = setTimeout(() => {
                this._timeoutHandler = undefined;
                this.reject(new Error("DeferredValue timeout"));
            });
        }
    }
}

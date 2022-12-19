/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type DeferredResult<T> = {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (reason: any) => void;
};

export function defer<T>(): DeferredResult<T> {
    let resolve: (value: T) => void = undefined as any;
    let reject: (reason: any) => void = undefined as any;

    const promise: Promise<T> = new Promise<T>((_resolve: (value: T) => void, _reject: (reason: any) => void) => {
        resolve = _resolve;
        reject = _reject;
    });

    return {
        promise,
        resolve,
        reject,
    };
}

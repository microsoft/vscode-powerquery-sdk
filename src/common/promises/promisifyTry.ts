/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { DidResolvedResult, doResolve } from "./doResolve";
import { ReturnedFunction } from "./types";

export type PromisifyTriedResult<T> = DidResolvedResult<T> | Promise<never>;

export function promisifyTry<T>(fn: ReturnedFunction<T>): PromisifyTriedResult<T> {
    try {
        return doResolve(fn());
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        return Promise.reject(error);
    }
}

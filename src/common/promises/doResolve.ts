/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { isPromise } from "./isPromise";

export type DidResolvedResult<T> = (value: T) => T extends Promise<unknown> ? T : Promise<T>;

export function doResolve<T>(value: T): DidResolvedResult<T> {
    return (isPromise(value) ? value : Promise.resolve(value)) as unknown as DidResolvedResult<T>;
}

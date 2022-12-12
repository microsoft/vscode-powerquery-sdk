/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { AnyFunction } from "./types";

export function setFunctionNameAndLength<T = AnyFunction>(
    fn: T,
    name: string,
    length: number,
): T & { length: number; name: string } {
    return Object.defineProperties(fn, {
        length: {
            configurable: true,
            value: length > 0 ? length : 0,
        },
        name: {
            configurable: true,
            value: name,
        },
    }) as T & { length: number; name: string };
}

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

/* eslint-disable prefer-rest-params */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { AnyFunction } from "./types";

export const once = <F extends AnyFunction>(fun: F): F => {
    let result: ReturnType<F> | undefined = undefined;
    let internalFun: F | undefined = fun;

    return function (this: any) {
        // eslint-disable-next-line @typescript-eslint/no-this-alias,no-invalid-this
        const self: unknown = this as any;
        const args: unknown[] = [...arguments];

        if (internalFun) {
            result = fun.apply(self, args);
            internalFun = undefined;
        }

        return result;
    } as F;
};

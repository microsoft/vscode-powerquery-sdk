/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

/* eslint-disable prefer-rest-params */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { CancelAction, CancelSource, CancelToken } from "./CancelToken";
import { AnyReturnedFunction } from "./types";
import { setFunctionNameAndLength } from "./setFunctionNameAndLength";

export type InternalPromise<T = unknown> = Promise<T> & { cancel: CancelAction };

export const cancelable = <F extends AnyReturnedFunction<Promise<unknown>>>(
    target: F,
    name: string | undefined = undefined,
): F extends (arg0: CancelToken, ...args: unknown[]) => unknown
    ? F
    : (arg0: CancelToken, ...args: Parameters<F>) => ReturnType<F> =>
    // noop
    setFunctionNameAndLength(
        function cancelableWrapper(this: any): ReturnType<F> {
            // eslint-disable-next-line @typescript-eslint/no-this-alias,no-invalid-this
            const self: unknown = this as any;
            const args: unknown[] = [...arguments];
            const length: number = arguments.length;

            if (length !== 0 && CancelToken.isCancelToken(arguments[0])) {
                // eslint-disable-next-line no-invalid-this
                return target.apply(self, args) as ReturnType<F>;
            }

            const cancelSource: CancelSource = new CancelSource();
            const newArgs: unknown[] = new Array(length + 1);
            newArgs[0] = cancelSource.token;

            for (let i: number = 0; i < length; ++i) {
                newArgs[i + 1] = arguments[i];
            }

            // eslint-disable-next-line no-invalid-this
            const promise: InternalPromise = target.apply(this, newArgs) as unknown as InternalPromise;
            promise.cancel = cancelSource.cancel;

            return promise as unknown as ReturnType<F>;
        },
        name ?? target.name,
        target.length - 1,
    ) as unknown as any;

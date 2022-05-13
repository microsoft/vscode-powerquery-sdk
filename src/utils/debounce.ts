/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

type TargetFunctionType<Args extends Array<unknown>> = (...args: Args) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce<Args extends Array<unknown> = any[]>(
    fn: TargetFunctionType<Args>,
    ms: number,
): TargetFunctionType<Args> {
    let timeout: NodeJS.Timeout | undefined;

    return function (...args: Args) {
        const _args: Args = (args?.slice() ?? []) as Args;
        timeout && clearTimeout(timeout);

        timeout = setTimeout(function () {
            fn(..._args);
        }, ms);
    };
}

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce(fn: (...args: any[]) => any, ms: number) {
    let timeout: NodeJS.Timeout | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return function (...args: any[]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const _args: any[] = [...args];
        timeout && clearTimeout(timeout);
        timeout = setTimeout(function () {
            fn(..._args);
        }, ms);
    };
}

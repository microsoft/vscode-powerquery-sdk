/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isPromise: (value: unknown) => boolean = (value: any) => value != null && typeof value.then === "function";

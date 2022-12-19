/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type AnyFunction = (...args: any[]) => any;
export type AnyReturnedFunction<T = any> = (...args: any[]) => T;

export type UnknownFunction = (...args: unknown[]) => unknown;

export type ReturnedFunction<T> = (...args: unknown[]) => T;

export interface BasicEvent {
    type: string;
}

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

export type RecordKeys<R> = R extends Record<infer K, unknown> ? K : unknown;

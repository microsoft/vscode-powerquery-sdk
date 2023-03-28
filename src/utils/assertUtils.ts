/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as assert from "assert";

export function assertNotNull<T>(value: T | undefined, errorMessage: string = "Found an unexpected nullable value"): T {
    assert.ok(Boolean(value), errorMessage);

    return value as T;
}

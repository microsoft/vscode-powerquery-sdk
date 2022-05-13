/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

export function convertStringToInteger(str: string): number | undefined {
    const oneNum: number = Number.parseInt(str, 10);

    if (Number.isInteger(oneNum)) {
        return oneNum;
    }

    return undefined;
}

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { NumberIterator } from "./NumberIterator";

export const fibonacciNumbers: () => NumberIterator = () => {
    let curVal: number = 1;
    let nextVal: number = 1;

    return new NumberIterator(() => {
        const value: number = curVal;
        curVal = nextVal;
        nextVal += value;

        return {
            done: false,
            value,
        };
    });
};

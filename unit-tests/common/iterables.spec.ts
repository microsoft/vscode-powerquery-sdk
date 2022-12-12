/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as chai from "chai";

import { NumberGenerator, NumberIterator } from "../../src/common/iterables/NumberIterator";
import { fibonacciNumbers } from "../../src/common/iterables/FibonacciNumbers";

const expect = chai.expect;

const testIterable: (iterable: NumberGenerator, values: number[]) => void = (
    iterable: () => NumberIterator,
    values: number[],
) => {
    let iterator: NumberIterator = iterable();

    if (!iterable == null) {
        throw new TypeError("is not iterable");
    }

    for (const value of values) {
        const cursor = iterator.next();

        if (cursor.done) {
            throw new Error("unexpected end of iterable");
        }

        expect(cursor.value).eq(value);
    }
};

describe("Promises::iterables", () => {
    it("fibonacciNumbers generator", () => {
        testIterable(fibonacciNumbers, [1, 1, 2, 3, 5, 8, 13, 21, 34, 55]);
    });
});

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

export const DONE: IteratorReturnResult<undefined> = { done: true, value: undefined };

export type NumberIteratorResult = IteratorResult<number, undefined>;
export type IterableNumbers = () => NumberIteratorResult;
export type NumberMapper = (para: number) => number;
export type NumberGenerator = () => NumberIterator;

const toMsMapper: NumberMapper = (x: number) => Math.floor(x * 1e3);

export class NumberIterator implements Iterator<number, undefined, undefined> {
    next: IterableNumbers;

    constructor(_next: IterableNumbers) {
        this.next = _next;
    }

    [Symbol.iterator](): Iterator<number, undefined, undefined> {
        return this;
    }

    map(fn: NumberMapper): NumberIterator {
        return new NumberIterator(() => {
            const cursor: NumberIteratorResult = this.next();

            if (cursor.done) {
                return cursor;
            }

            return {
                done: false,
                value: fn(cursor.value),
            };
        });
    }

    addNoise(factor: number = 0.1): NumberIterator {
        return this.map((value: number) => value * (1 + (Math.random() - 0.5) * factor));
    }

    toMs(): NumberIterator {
        return this.map(toMsMapper);
    }

    clamp(min: number, max: number): NumberIterator {
        // eslint-disable-next-line no-nested-ternary
        return this.map((value: number) => (value < min ? min : value > max ? max : value));
    }

    take(n: number): NumberIterator {
        let i: number = 0;

        return new NumberIterator(() => {
            if (i < n) {
                ++i;

                return this.next();
            }

            return DONE;
        });
    }
}

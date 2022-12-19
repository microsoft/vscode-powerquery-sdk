/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

export class BaseError extends Error {
    constructor(message: string) {
        super(message);
    }

    /**
     * Capture current stack trace of the caller
     */
    captureStackTrace(): string | undefined {
        const container: Error = new Error();
        this.stack = container.stack;

        return this.stack;
    }
}

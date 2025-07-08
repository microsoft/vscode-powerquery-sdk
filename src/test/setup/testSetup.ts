/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as sinon from "sinon";

// Global test utilities
let sinonSandbox: sinon.SinonSandbox;

/**
 * Initialize test setup - call this in beforeEach
 */
export function initializeTestSetup(): void {
    sinonSandbox = sinon.createSandbox();
}

/**
 * Clean up test setup - call this in afterEach
 */
export function cleanupTestSetup(): void {
    if (sinonSandbox) {
        sinonSandbox.restore();
    }
}

/**
 * Gets the current sinon sandbox for creating stubs and mocks
 */
export function getSandbox(): sinon.SinonSandbox {
    return sinonSandbox;
}

/**
 * Helper function for async test delays
 */
export function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Helper function to wait for a condition to be true
 */
export async function waitFor(
    condition: () => boolean | Promise<boolean>,
    timeoutMs: number = 5000,
    intervalMs: number = 100,
): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        const result = await condition();

        if (result) {
            return;
        }

        await delay(intervalMs);
    }

    throw new Error(`Timeout waiting for condition after ${timeoutMs}ms`);
}

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as assert from "assert";
import * as vscode from "vscode";

import { extensionId, extensionPublisher } from "./common";

const defaultTestPromiseTimeout: number = 5000;

const sdkExtensionId: string = `${extensionPublisher}.${extensionId}`;

export function CreateAsyncTestResult(fn: () => void): Promise<void> {
    return new Promise((resolve, reject) => {
        fn();
        resolve();

        setTimeout(() => {
            reject(new Error(`TestResult timeout exceeded: ${defaultTestPromiseTimeout}ms`));
        }, defaultTestPromiseTimeout);
    });
}

export async function activateExtension(): Promise<void> {
    const extension: vscode.Extension<unknown> =
        vscode.extensions.getExtension(sdkExtensionId) || assert.fail(`Extension not found: ${sdkExtensionId}`);

    if (!extension.isActive) {
        await extension.activate();
    }
}

export async function waitForExtensionToBeAvailable(extensionId: string, timeoutMs: number = 30000): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        const extension = vscode.extensions.getExtension(extensionId);

        if (extension) {
            // Extension is available, now check if it's activated
            if (extension.isActive) {
                return true;
            }

            // Try to activate it
            try {
                await extension.activate();

                return true;
            } catch (error) {
                console.warn(`Failed to activate extension ${extensionId}:`, error);
            }
        }

        // Wait a bit before checking again
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    return false;
}

export async function ensureRequiredExtensionsAreLoaded(): Promise<void> {
    // Wait for the PowerQuery language service extension
    const languageServiceExtensionId = "powerquery.vscode-powerquery";
    const isLanguageServiceAvailable = await waitForExtensionToBeAvailable(languageServiceExtensionId, 30000);

    if (!isLanguageServiceAvailable) {
        console.warn(
            `Language service extension ${languageServiceExtensionId} is not available. Some tests may be skipped.`,
        );
    }

    // Ensure our SDK extension is activated
    await activateExtension();
}

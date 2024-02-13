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
    const extension: vscode.Extension<any> =
        vscode.extensions.getExtension(sdkExtensionId) || assert.fail(`Extension not found: ${sdkExtensionId}`);

    if (!extension.isActive) {
        await extension.activate();
    }
}

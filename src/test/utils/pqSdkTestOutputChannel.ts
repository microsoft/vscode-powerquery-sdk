/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import type { PqSdkOutputChannelLight } from "../../features/PqSdkOutputChannel";

/**
 * Test output channel for unit testing purposes
 * Works in both Node.js and VS Code environments
 */
export class PqSdkTestOutputChannel implements PqSdkOutputChannelLight {
    private static instance: PqSdkTestOutputChannel;
    private messages: string[] = [];

    private constructor() {
        // No-op constructor for unit test compatibility
    }

    public static getInstance(): PqSdkTestOutputChannel {
        if (!PqSdkTestOutputChannel.instance) {
            PqSdkTestOutputChannel.instance = new PqSdkTestOutputChannel();
        }

        return PqSdkTestOutputChannel.instance;
    }

    public appendInfoLine(message: string): void {
        this.messages.push(`[INFO] ${message}`);
        console.log(`[INFO] ${message}`);
    }

    public appendErrorLine(message: string): void {
        this.messages.push(`[ERROR] ${message}`);
        console.error(`[ERROR] ${message}`);
    }

    public appendLine(message: string): void {
        this.messages.push(message);
        console.log(message);
    }

    public clear(): void {
        this.messages = [];
    }

    public show(): void {
        // No-op for unit tests
    }

    public dispose(): void {
        this.clear();
    }

    public emit(): void {
        // Legacy method for test compatibility
        this.show();
    }

    public getMessages(): string[] {
        return [...this.messages];
    }
}

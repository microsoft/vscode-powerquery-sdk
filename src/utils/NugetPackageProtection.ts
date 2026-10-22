/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as path from "path";

import { IDisposable } from "../common/Disposable";
import { DisposableEventEmitter } from "../common/DisposableEventEmitter";
import type { PqSdkOutputChannel } from "../features/PqSdkOutputChannel";
import { NugetPackageCleanupInProgressError, protectNugetPackage } from "./nugetPackageUsage";

interface PendingProtection {
    readonly promise: Promise<void>;
    readonly cancel: () => void;
}

interface ToolsLocationState {
    readonly configuredLocation: string | undefined;
    readonly currentLocation: string;
    readonly ready: boolean;
}

export class NugetPackageProtection extends DisposableEventEmitter<"recovered"> {
    private readonly pending: Map<string, PendingProtection> = new Map();
    private disposed: boolean = false;
    private outputChannel: Pick<PqSdkOutputChannel, "appendInfoLine" | "appendErrorLine"> = {
        appendInfoLine: (message: string): void => console.info(message),
        appendErrorLine: (message: string): void => console.error(message),
    };

    public setOutputChannel(outputChannel: Pick<PqSdkOutputChannel, "appendInfoLine" | "appendErrorLine">): void {
        this.outputChannel = outputChannel;
    }

    public subscribeToLocationRecovery(getState: () => ToolsLocationState, refresh: () => void): IDisposable {
        return this.subscribeOneEvent("recovered", () => {
            const state: ToolsLocationState = getState();

            if (
                state.configuredLocation &&
                (!state.ready || path.relative(state.currentLocation, state.configuredLocation) !== "")
            ) {
                refresh();
            }
        });
    }

    public getProtectedExecutablePath(baseNugetFolder: string, executablePath: string): string {
        const toolsLocation: string = path.dirname(executablePath);

        if (!this.getProtectedLocation(baseNugetFolder, toolsLocation)) {
            throw new NugetPackageCleanupInProgressError(toolsLocation);
        }

        return executablePath;
    }

    public getProtectedLocation(baseNugetFolder: string, toolsLocation: string): string | undefined {
        if (this.disposed) {
            throw new Error("SDK package protection has been disposed");
        }

        try {
            protectNugetPackage(baseNugetFolder, toolsLocation);

            return toolsLocation;
        } catch (error: unknown) {
            if (!(error instanceof NugetPackageCleanupInProgressError)) {
                throw error;
            }

            const key: string = path.resolve(toolsLocation).toLowerCase();

            if (!this.pending.has(key)) {
                this.outputChannel.appendInfoLine(`Waiting for SDK package protection: ${error.message}`);
                const retry: PendingProtection = this.createRetry(baseNugetFolder, toolsLocation);
                this.pending.set(key, retry);

                void retry.promise
                    .then(() => {
                        this.pending.delete(key);
                        this.emit("recovered");
                    })
                    .catch((failure: unknown) => {
                        this.pending.delete(key);

                        if (!this.disposed) {
                            this.outputChannel.appendErrorLine(
                                `Cannot protect configured SDK packages due to ${failure}`,
                            );
                        }
                    });
            }

            return undefined;
        }
    }

    public async waitForPending(): Promise<void> {
        if (this.disposed) {
            throw new Error("SDK package protection has been disposed");
        }

        await Promise.all(Array.from(this.pending.values(), (entry: PendingProtection) => entry.promise));

        if (this.pending.size) {
            await this.waitForPending();
        }
    }

    private createRetry(baseNugetFolder: string, toolsLocation: string): PendingProtection {
        let timer: NodeJS.Timeout;
        let cancel: () => void = (): void => {};

        const promise: Promise<void> = new Promise((resolve: () => void, reject: (reason: unknown) => void) => {
            const attempt: () => void = (): void => {
                try {
                    protectNugetPackage(baseNugetFolder, toolsLocation);
                    resolve();
                } catch (error: unknown) {
                    if (error instanceof NugetPackageCleanupInProgressError) {
                        timer = setTimeout(attempt, 100);
                        timer.unref();
                    } else {
                        reject(error);
                    }
                }
            };

            timer = setTimeout(attempt, 100);
            timer.unref();

            cancel = (): void => {
                clearTimeout(timer);
                reject(new Error("SDK package protection has been disposed"));
            };
        });

        return { promise, cancel };
    }

    public override dispose(): void {
        this.disposed = true;

        for (const entry of this.pending.values()) {
            entry.cancel();
        }

        this.pending.clear();
        super.dispose();
    }
}

export const nugetPackageProtection: NugetPackageProtection = new NugetPackageProtection();

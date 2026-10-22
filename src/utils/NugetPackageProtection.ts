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
import {
    NugetPackageCleanupInProgressError,
    nugetPackageRequiresProtection,
    protectNugetPackage,
} from "./nugetPackageUsage";

export class NugetPackageProtectionPendingError extends Error {
    constructor(toolsLocation: string) {
        super(`SDK package protection is pending; retry selecting ${toolsLocation}`);
        this.name = "NugetPackageProtectionPendingError";
    }
}

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
    private readonly protectedLocations: Set<string> = new Set();
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
            throw new NugetPackageProtectionPendingError(toolsLocation);
        }

        return executablePath;
    }

    public getProtectedLocation(baseNugetFolder: string, toolsLocation: string): string | undefined {
        if (this.disposed) {
            throw new Error("SDK package protection has been disposed");
        }

        const key: string = path.resolve(toolsLocation).toLowerCase();

        // A verified process-lifetime lease prevents future cleanup from deleting this location.
        if (this.protectedLocations.has(key) || !nugetPackageRequiresProtection(baseNugetFolder, toolsLocation)) {
            return toolsLocation;
        }

        if (!this.pending.has(key)) {
            this.outputChannel.appendInfoLine(`Waiting for SDK package protection: ${toolsLocation}`);
            const retry: PendingProtection = this.createRetry(baseNugetFolder, toolsLocation);
            this.pending.set(key, retry);

            void retry.promise
                .then(() => {
                    this.pending.delete(key);
                    this.protectedLocations.add(key);
                    this.emit("recovered");
                })
                .catch((failure: unknown) => {
                    this.pending.delete(key);

                    if (!this.disposed) {
                        this.outputChannel.appendErrorLine(`Cannot protect configured SDK packages due to ${failure}`);
                    }
                });
        }

        return undefined;
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
        let timer: NodeJS.Timeout | undefined;
        const controller: globalThis.AbortController = new globalThis.AbortController();
        let cancel: () => void = (): void => {};

        const promise: Promise<void> = new Promise((resolve: () => void, reject: (reason: unknown) => void) => {
            const attempt: () => Promise<void> = async (): Promise<void> => {
                try {
                    await protectNugetPackage(baseNugetFolder, toolsLocation, controller.signal);
                    resolve();
                } catch (error: unknown) {
                    if (error instanceof NugetPackageCleanupInProgressError && !controller.signal.aborted) {
                        timer = setTimeout(() => void attempt(), 100);
                        timer.unref();
                    } else {
                        reject(error);
                    }
                }
            };

            void attempt();

            cancel = (): void => {
                if (timer) {
                    clearTimeout(timer);
                }

                controller.abort();
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
        this.protectedLocations.clear();
        super.dispose();
    }
}

export const nugetPackageProtection: NugetPackageProtection = new NugetPackageProtection();

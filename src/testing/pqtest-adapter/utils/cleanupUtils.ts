/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as fs from "fs/promises";
import * as path from "path";

import { ExtensionConstants } from "../../../constants/PowerQuerySdkExtension";
import { ExtensionConfigurations } from "../../../constants/PowerQuerySdkConfiguration";

import { PqSdkOutputChannel } from "../../../features/PqSdkOutputChannel";
import { extensionI18n, resolveI18nTemplate } from "../../../i18n/extension";
import { getTestSettingsFileUris } from "./testSettingsUtils";

// In-memory throttle state
let lastCleanupTimestamp: number = 0;
const THROTTLE_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours in milliseconds

// Cached output channel reference for cleanup
let cachedOutputChannel: PqSdkOutputChannel | undefined;

/**
 * Initialize cleanup timer. Called at activation.
 * Stores the output channel reference for later use.
 */
export function initializeCleanupTimer(outputChannel: PqSdkOutputChannel): void {
    cachedOutputChannel = outputChannel;
    // Placeholder for future periodic cleanup timer
    // Currently we use throttled on-demand cleanup
}

/**
 * Check if cleanup should run based on throttle interval
 * If enough time has passed, trigger cleanup
 */
export function maybeCleanupIntermediateResults(): void {
    const now = Date.now();

    if (now - lastCleanupTimestamp >= THROTTLE_INTERVAL_MS) {
        lastCleanupTimestamp = now;
        // let the cleanup run in background
        void cleanupOldIntermediateResults(cachedOutputChannel);
    }
}

/**
 * Clean up old intermediate test results from the default folder.
 * Only cleans the default location - custom paths are user's responsibility.
 * Resolves the default folder relative to each testsettings.json file location.
 */
export async function cleanupOldIntermediateResults(outputChannel?: PqSdkOutputChannel): Promise<void> {
    const cleanupAfterHours = ExtensionConfigurations.CleanupIntermediateResultsAfterHours;

    // If cleanup is disabled (0 or negative), skip
    if (cleanupAfterHours <= 0) {
        outputChannel?.appendDebugLine(extensionI18n["PQSdk.testAdapter.cleanup.disabled"]);

        return;
    }

    // Get the default folder path (relative to testsettings file)
    const defaultFolder = ExtensionConstants.TestAdapter.DefaultIntermediateResultsFolder;

    // Find all testsettings.json files using the existing utility
    const testSettingsFiles = await getTestSettingsFileUris(outputChannel);

    if (testSettingsFiles.length === 0) {
        return;
    }

    // Resolve the default folder relative to each testsettings file and deduplicate
    const foldersToClean = new Set<string>();

    for (const settingsFile of testSettingsFiles) {
        const settingsDir = path.dirname(settingsFile.fsPath);
        const absolutePath = path.resolve(settingsDir, defaultFolder);
        foldersToClean.add(absolutePath);
    }

    const thresholdMs = cleanupAfterHours * 60 * 60 * 1000;
    const now = Date.now();

    for (const folderPath of foldersToClean) {
        try {
            await cleanupFolder(folderPath, now, thresholdMs, outputChannel);
        } catch (error) {
            // Folder might not exist, which is fine
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
                outputChannel?.appendDebugLine(
                    resolveI18nTemplate("PQSdk.testAdapter.cleanup.folderCleanupFailed", {
                        folderPath,
                        errorMessage: String(error),
                    }),
                );
            }
        }
    }
}

/**
 * Clean up files and subdirectories older than threshold in the specified folder.
 * Only deletes contents, not the folder itself.
 */
async function cleanupFolder(
    folderPath: string,
    now: number,
    thresholdMs: number,
    outputChannel?: PqSdkOutputChannel,
): Promise<void> {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    let deletedCount = 0;

    for (const entry of entries) {
        const entryPath = path.join(folderPath, entry.name);

        try {
            const stats = await fs.stat(entryPath);
            const age = now - stats.mtimeMs;

            if (age > thresholdMs) {
                if (entry.isDirectory()) {
                    await fs.rm(entryPath, { recursive: true, force: true });
                } else {
                    await fs.unlink(entryPath);
                }

                deletedCount++;
            }
        } catch (error) {
            outputChannel?.appendDebugLine(
                resolveI18nTemplate("PQSdk.testAdapter.cleanup.entryDeleteFailed", {
                    entryPath,
                    errorMessage: String(error),
                }),
            );
        }
    }

    if (deletedCount > 0) {
        outputChannel?.appendInfoLine(
            resolveI18nTemplate("PQSdk.testAdapter.cleanup.completed", {
                count: String(deletedCount),
                folderPath,
            }),
        );
    }
}

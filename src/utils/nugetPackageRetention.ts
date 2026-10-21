/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as fs from "fs";
import * as path from "path";

import { ExtensionConstants } from "../constants/PowerQuerySdkExtension";
import type { PqSdkOutputChannelLight } from "../features/PqSdkOutputChannel";
import { removeDirectoryRecursively } from "./files";
import { NugetVersions } from "./NugetVersions";

interface CachedSdkPackage {
    directory: string;
    version: NugetVersions;
}

export async function cleanupNugetPackages(
    baseNugetFolder: string,
    selectedToolsLocation: string | undefined,
    packagesToKeep: number,
    outputChannel?: PqSdkOutputChannelLight,
): Promise<void> {
    if (!Number.isSafeInteger(packagesToKeep) || packagesToKeep < 1) {
        outputChannel?.appendErrorLine(`Invalid SDK package retention count: ${packagesToKeep}`);

        return;
    }

    if (!selectedToolsLocation || !fs.existsSync(baseNugetFolder)) return;

    try {
        if ((await fs.promises.lstat(baseNugetFolder)).isSymbolicLink()) return;

        const entries: fs.Dirent[] = await fs.promises.readdir(baseNugetFolder, { withFileTypes: true });
        const packages: CachedSdkPackage[] = [];
        const prefix: string = `${ExtensionConstants.InternalMsftPqSdkToolsNugetName}.`;

        for (const entry of entries) {
            if (!entry.isDirectory() || !entry.name.startsWith(prefix)) continue;

            const version: NugetVersions = NugetVersions.createFromReleasedVersionString(
                entry.name.slice(prefix.length),
            );

            if (version.isZero()) continue;

            packages.push({ directory: path.join(baseNugetFolder, entry.name), version });
        }

        const selectedPackage: CachedSdkPackage | undefined = packages.find(
            (candidate: CachedSdkPackage) =>
                path.relative(path.join(candidate.directory, "tools"), path.resolve(selectedToolsLocation)) === "",
        );

        // Only extension-managed, usable tools authorize deleting cached packages.
        if (!selectedPackage || !fs.existsSync(path.join(selectedPackage.directory, "tools", "PQTest.exe"))) return;

        packages.sort((left: CachedSdkPackage, right: CachedSdkPackage) =>
            NugetVersions.compare(right.version, left.version),
        );

        const obsoletePackages: CachedSdkPackage[] = packages
            .filter((candidate: CachedSdkPackage) => candidate.directory !== selectedPackage.directory)
            .slice(packagesToKeep - 1);

        await Promise.all(
            obsoletePackages.map(async (obsoletePackage: CachedSdkPackage) => {
                try {
                    await removeDirectoryRecursively(obsoletePackage.directory);
                    outputChannel?.appendInfoLine(`Removed cached SDK package ${obsoletePackage.directory}`);
                } catch (error: unknown) {
                    outputChannel?.appendErrorLine(
                        `Cannot remove cached SDK package ${obsoletePackage.directory} due to ${error}`,
                    );
                }
            }),
        );
    } catch (error: unknown) {
        outputChannel?.appendErrorLine(`Cannot clean up cached SDK packages in ${baseNugetFolder} due to ${error}`);
    }
}

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
import { nugetPackageIsInUse, protectNugetPackage, removeUnusedNugetPackage } from "./nugetPackageUsage";
import { NugetVersions } from "./NugetVersions";

interface CachedSdkPackage {
    readonly directory: string;
    readonly version: NugetVersions;
}

export async function cleanupNugetPackages(
    baseNugetFolder: string,
    selectedToolsLocation: string | undefined,
    numberOfPackagesToKeep: number,
    outputChannel?: PqSdkOutputChannelLight,
): Promise<void> {
    if (!Number.isSafeInteger(numberOfPackagesToKeep) || numberOfPackagesToKeep < 1) {
        outputChannel?.appendErrorLine(`Invalid SDK package retention count: ${numberOfPackagesToKeep}`);

        return;
    }

    if (!selectedToolsLocation || !fs.existsSync(baseNugetFolder)) {
        return;
    }

    try {
        if ((await fs.promises.lstat(baseNugetFolder)).isSymbolicLink()) {
            return;
        }

        const entries: ReadonlyArray<fs.Dirent> = await fs.promises.readdir(baseNugetFolder, { withFileTypes: true });
        const packages: CachedSdkPackage[] = [];
        const prefix: string = `${ExtensionConstants.InternalMsftPqSdkToolsNugetName}.`;

        for (const entry of entries) {
            if (!entry.isDirectory() || !entry.name.toLowerCase().startsWith(prefix.toLowerCase())) {
                continue;
            }

            const version: NugetVersions = NugetVersions.createFromReleasedVersionString(
                entry.name.slice(prefix.length),
            );

            if (version.isZero()) {
                continue;
            }

            packages.push({ directory: path.join(baseNugetFolder, entry.name), version });
        }

        const selectedPackage: CachedSdkPackage | undefined = packages.find(
            (candidate: CachedSdkPackage) =>
                path.relative(path.join(candidate.directory, "tools"), path.resolve(selectedToolsLocation)) === "",
        );

        // Only extension-managed, usable tools authorize deleting cached packages.
        if (!selectedPackage || !fs.existsSync(path.join(selectedPackage.directory, "tools", "PQTest.exe"))) {
            return;
        }

        protectNugetPackage(baseNugetFolder, selectedToolsLocation);

        packages.sort((left: CachedSdkPackage, right: CachedSdkPackage) =>
            NugetVersions.compare(right.version, left.version),
        );

        const protectedPackages: ReadonlyArray<CachedSdkPackage> = packages.filter((candidate: CachedSdkPackage) =>
            nugetPackageIsInUse(baseNugetFolder, candidate.directory),
        );

        const obsoletePackages: ReadonlyArray<CachedSdkPackage> = packages
            .filter((candidate: CachedSdkPackage) => !protectedPackages.includes(candidate))
            .slice(Math.max(0, numberOfPackagesToKeep - protectedPackages.length));

        await Promise.all(
            obsoletePackages.map(async (obsoletePackage: CachedSdkPackage) => {
                try {
                    if (await removeUnusedNugetPackage(baseNugetFolder, obsoletePackage.directory)) {
                        outputChannel?.appendInfoLine(`Removed cached SDK package ${obsoletePackage.directory}`);
                    }
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

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";

import { ExtensionConstants } from "../constants/PowerQuerySdkExtension";
import { removeDirectoryRecursively } from "./files";
import { NugetVersions } from "./NugetVersions";

const usageDirectoryName: string = ".sdk-package-usage";
const markerPattern: RegExp = /^(use|cleanup)-([1-9]\d*)-([a-f0-9-]{36})$/;
const owner: string = `${process.pid}-${randomUUID()}`;

export class NugetPackageCleanupInProgressError extends Error {
    constructor(toolsLocation: string) {
        super(`SDK package cleanup is in progress; retry selecting ${toolsLocation}`);
        this.name = "NugetPackageCleanupInProgressError";
    }
}

function hasErrorCode(error: unknown, code: string): boolean {
    return error instanceof Error && "code" in error && error.code === code;
}

function removeMarker(marker: string): void {
    try {
        fs.unlinkSync(marker);
    } catch (error: unknown) {
        if (!hasErrorCode(error, "ENOENT")) {
            throw error;
        }
    }
}

function processIsAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);

        return true;
    } catch (error: unknown) {
        // Permission errors and unknown failures must not authorize deleting another host's tools.
        if (!hasErrorCode(error, "ESRCH")) {
            throw error;
        }

        return false;
    }
}

function assertRealDirectory(directory: string): void {
    const stats: fs.Stats = fs.lstatSync(directory);

    if (!stats.isDirectory() || stats.isSymbolicLink()) {
        throw new Error(`SDK package coordination requires a real directory: ${directory}`);
    }
}

function getUsageDirectory(baseNugetFolder: string, packageDirectory: string): string {
    assertRealDirectory(baseNugetFolder);

    const usageDirectory: string = path.join(baseNugetFolder, usageDirectoryName);
    fs.mkdirSync(usageDirectory, { recursive: true });
    assertRealDirectory(usageDirectory);

    const packageUsageDirectory: string = path.join(usageDirectory, path.basename(packageDirectory));
    fs.mkdirSync(packageUsageDirectory, { recursive: true });
    assertRealDirectory(packageUsageDirectory);

    return packageUsageDirectory;
}

function getManagedPackageDirectory(baseNugetFolder: string, toolsLocation: string): string | undefined {
    const packageDirectory: string = path.dirname(path.resolve(toolsLocation));
    const prefix: string = `${ExtensionConstants.InternalMsftPqSdkToolsNugetName}.`;
    const packageName: string = path.basename(packageDirectory);

    if (
        path.relative(baseNugetFolder, path.dirname(packageDirectory)) !== "" ||
        path.basename(toolsLocation).toLowerCase() !== "tools" ||
        !packageName.toLowerCase().startsWith(prefix.toLowerCase()) ||
        NugetVersions.createFromReleasedVersionString(packageName.slice(prefix.length)).isZero()
    ) {
        return undefined;
    }

    return packageDirectory;
}

function getLiveMarkers(usageDirectory: string, kind?: "use" | "cleanup"): ReadonlyArray<string> {
    const markers: ReadonlyArray<fs.Dirent> = fs.readdirSync(usageDirectory, { withFileTypes: true });
    const liveMarkers: string[] = [];

    for (const marker of markers) {
        const match: RegExpExecArray | null = markerPattern.exec(marker.name);

        if (!marker.isFile() || !match) {
            throw new Error(`Unrecognized SDK package usage marker: ${path.join(usageDirectory, marker.name)}`);
        }

        if (kind && match[1] !== kind) {
            continue;
        }

        if (processIsAlive(Number(match[2]))) {
            liveMarkers.push(marker.name);
        } else {
            removeMarker(path.join(usageDirectory, marker.name));
        }
    }

    return liveMarkers;
}

export function protectNugetPackage(baseNugetFolder: string, toolsLocation: string): void {
    const packageDirectory: string | undefined = getManagedPackageDirectory(baseNugetFolder, toolsLocation);

    if (!packageDirectory) {
        return;
    }

    fs.mkdirSync(baseNugetFolder, { recursive: true });

    // A linked cache is never cleaned; leave its ownership and contents alone.
    if (fs.lstatSync(baseNugetFolder).isSymbolicLink()) {
        return;
    }

    const usageDirectory: string = getUsageDirectory(baseNugetFolder, packageDirectory);
    const marker: string = path.join(usageDirectory, `use-${owner}`);

    // Keep leases for this process's lifetime: existing queues/tasks may retain previous tool paths.
    // Publish before checking deletion intent; a cleaner must see our lease or we must see its guard.
    fs.closeSync(fs.openSync(marker, "a"));

    if (getLiveMarkers(usageDirectory, "cleanup").length) {
        throw new NugetPackageCleanupInProgressError(toolsLocation);
    }
}

export function nugetPackageIsInUse(baseNugetFolder: string, packageDirectory: string): boolean {
    return getLiveMarkers(getUsageDirectory(baseNugetFolder, packageDirectory), "use").length > 0;
}

export async function removeUnusedNugetPackage(baseNugetFolder: string, packageDirectory: string): Promise<boolean> {
    if (
        getManagedPackageDirectory(baseNugetFolder, path.join(packageDirectory, "tools")) !==
        path.resolve(packageDirectory)
    ) {
        throw new Error(`Cannot clean up an unmanaged SDK package: ${packageDirectory}`);
    }

    const usageDirectory: string = getUsageDirectory(baseNugetFolder, packageDirectory);
    const markerName: string = `cleanup-${owner}`;
    const marker: string = path.join(usageDirectory, markerName);

    try {
        fs.closeSync(fs.openSync(marker, "wx"));
    } catch (error: unknown) {
        if (hasErrorCode(error, "EEXIST")) {
            return false;
        }

        throw error;
    }

    try {
        const otherMarkers: ReadonlyArray<string> = getLiveMarkers(usageDirectory).filter(
            (name: string) => name !== markerName,
        );

        if (otherMarkers.length) {
            return false;
        }

        assertRealDirectory(packageDirectory);
        await removeDirectoryRecursively(packageDirectory);

        return true;
    } finally {
        removeMarker(marker);
    }
}

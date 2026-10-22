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
import { getProcessCreationTime } from "./processIdentity";

const usageDirectoryName: string = ".sdk-package-usage";
const markerPattern: RegExp = /^(use|cleanup)-([1-9]\d*)-([1-9]\d*)-([a-f0-9-]{36})$/;
const legacyMarkerPattern: RegExp = /^(use|cleanup)-([1-9]\d*)-([a-f0-9-]{36})$/;
const ownerToken: string = randomUUID();

async function currentOwner(): Promise<string> {
    const creationTime: string | undefined = await getProcessCreationTime(process.pid);

    if (!creationTime) {
        throw new Error("Cannot determine the current SDK host's process identity");
    }

    return `${process.pid}-${creationTime}-${ownerToken}`;
}

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

async function processIsAlive(
    pid: number,
    creationTime: string | undefined,
    identities: Map<number, Promise<string | undefined>>,
): Promise<boolean> {
    try {
        process.kill(pid, 0);
    } catch (error: unknown) {
        // Permission errors and unknown failures must not authorize deleting another host's tools.
        if (!hasErrorCode(error, "ESRCH")) {
            throw error;
        }

        return false;
    }

    if (!creationTime) {
        throw new Error(`Cannot verify SDK package marker ownership without a process creation time: ${pid}`);
    }

    let identity: Promise<string | undefined> | undefined = identities.get(pid);

    if (!identity) {
        identity = getProcessCreationTime(pid);
        identities.set(pid, identity);
    }

    return (await identity) === creationTime;
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
    const resolvedToolsLocation: string = path.resolve(toolsLocation);
    const packageDirectory: string = path.dirname(resolvedToolsLocation);
    const prefix: string = `${ExtensionConstants.InternalMsftPqSdkToolsNugetName}.`;
    const packageName: string = path.basename(packageDirectory);

    if (
        path.relative(baseNugetFolder, path.dirname(packageDirectory)) !== "" ||
        path.basename(resolvedToolsLocation).toLowerCase() !== "tools" ||
        !packageName.toLowerCase().startsWith(prefix.toLowerCase()) ||
        NugetVersions.createFromReleasedVersionString(packageName.slice(prefix.length)).isZero()
    ) {
        return undefined;
    }

    return packageDirectory;
}

async function getLiveMarkers(usageDirectory: string, kind?: "use" | "cleanup"): Promise<ReadonlyArray<string>> {
    const markers: ReadonlyArray<fs.Dirent> = fs.readdirSync(usageDirectory, { withFileTypes: true });
    // Reuse identities only inside this immutable snapshot, never across scans where a PID could be reused.
    const identities: Map<number, Promise<string | undefined>> = new Map();

    const liveMarkers: ReadonlyArray<string | undefined> = await Promise.all(
        markers.map(async (marker: fs.Dirent) => {
            const match: RegExpExecArray | null =
                markerPattern.exec(marker.name) ?? legacyMarkerPattern.exec(marker.name);

            if (!marker.isFile() || !match) {
                throw new Error(`Unrecognized SDK package usage marker: ${path.join(usageDirectory, marker.name)}`);
            }

            if (kind && match[1] !== kind) {
                return undefined;
            }

            const creationTime: string | undefined = match.length === 5 ? match[3] : undefined;

            if (await processIsAlive(Number(match[2]), creationTime, identities)) {
                return marker.name;
            }

            removeMarker(path.join(usageDirectory, marker.name));

            return undefined;
        }),
    );

    return liveMarkers.filter((marker: string | undefined): marker is string => marker !== undefined);
}

export function nugetPackageRequiresProtection(baseNugetFolder: string, toolsLocation: string): boolean {
    return (
        getManagedPackageDirectory(baseNugetFolder, toolsLocation) !== undefined &&
        (!fs.existsSync(baseNugetFolder) || !fs.lstatSync(baseNugetFolder).isSymbolicLink())
    );
}

export async function protectNugetPackage(
    baseNugetFolder: string,
    toolsLocation: string,
    signal?: AbortSignal,
): Promise<void> {
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
    const owner: string = await currentOwner();
    signal?.throwIfAborted();
    const marker: string = path.join(usageDirectory, `use-${owner}`);

    // Keep leases for this process's lifetime: existing queues/tasks may retain previous tool paths.
    // Publish before checking deletion intent; a cleaner must see our lease or we must see its guard.
    fs.closeSync(fs.openSync(marker, "a"));

    const guards: ReadonlyArray<string> = await getLiveMarkers(usageDirectory, "cleanup");
    signal?.throwIfAborted();

    if (guards.length) {
        throw new NugetPackageCleanupInProgressError(toolsLocation);
    }
}

export async function nugetPackageIsInUse(baseNugetFolder: string, packageDirectory: string): Promise<boolean> {
    return (await getLiveMarkers(getUsageDirectory(baseNugetFolder, packageDirectory), "use")).length > 0;
}

export async function removeUnusedNugetPackage(baseNugetFolder: string, packageDirectory: string): Promise<boolean> {
    if (
        getManagedPackageDirectory(baseNugetFolder, path.join(packageDirectory, "tools")) !==
        path.resolve(packageDirectory)
    ) {
        throw new Error(`Cannot clean up an unmanaged SDK package: ${packageDirectory}`);
    }

    const usageDirectory: string = getUsageDirectory(baseNugetFolder, packageDirectory);
    const markerName: string = `cleanup-${await currentOwner()}`;
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
        const otherMarkers: ReadonlyArray<string> = (await getLiveMarkers(usageDirectory)).filter(
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

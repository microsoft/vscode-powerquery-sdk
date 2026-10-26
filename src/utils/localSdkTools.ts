/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { ExtensionConstants } from "../constants/PowerQuerySdkExtension";
import { NugetVersions } from "./NugetVersions";

let localToolsLocation: string | undefined;

function hasRequiredTools(location: string): boolean {
    if (!fs.statSync(location, { throwIfNoEntry: false })?.isDirectory()) {
        return false;
    }

    return ["PQTest.exe", ExtensionConstants.MakePQXExecutableName].every((executable: string) =>
        fs.statSync(path.join(location, executable), { throwIfNoEntry: false })?.isFile(),
    );
}

export function resolveLocalSdkTools(
    environment: NodeJS.ProcessEnv = process.env,
    homeDirectory: string = os.homedir(),
): string | undefined {
    const value: string | undefined = environment.PQSDK_TEST_TOOLS_PATH;

    if (value !== undefined) {
        if (!value.trim() || !path.isAbsolute(value)) {
            throw new Error("PQSDK_TEST_TOOLS_PATH must be an absolute path to an extracted SDK Tools directory.");
        }

        const location: string = path.normalize(value);

        if (!hasRequiredTools(location)) {
            throw new Error(
                `PQSDK_TEST_TOOLS_PATH requires PQTest.exe and MakePQX.exe in ${location}. No NuGet download will be attempted.`,
            );
        }

        return location;
    }

    if (environment.PQSDK_TEST_TOOLS_AUTODISCOVER !== "1") {
        return undefined;
    }

    const cache: string = environment.NUGET_PACKAGES ?? path.join(homeDirectory, ".nuget", "packages");

    if (!cache.trim() || !path.isAbsolute(cache)) {
        throw new Error("NUGET_PACKAGES must be an absolute path when PQSDK_TEST_TOOLS_AUTODISCOVER=1.");
    }

    const packageDirectory: string = path.join(cache, ExtensionConstants.PublicMsftPqSdkToolsNugetName.toLowerCase());

    if (!fs.statSync(packageDirectory, { throwIfNoEntry: false })?.isDirectory()) {
        throw new Error(
            `PQSDK_TEST_TOOLS_AUTODISCOVER found no SDK Tools package in ${packageDirectory}. No NuGet download will be attempted.`,
        );
    }

    const versions: { name: string; version: NugetVersions }[] = fs
        .readdirSync(packageDirectory, { withFileTypes: true })
        .filter((entry: fs.Dirent) => entry.isDirectory())
        .map((entry: fs.Dirent) => ({
            name: entry.name,
            version: NugetVersions.createFromReleasedVersionString(entry.name),
        }))
        .filter((entry: { name: string; version: NugetVersions }) => entry.version.toString() === entry.name)
        .sort((left: { version: NugetVersions }, right: { version: NugetVersions }) =>
            NugetVersions.compare(right.version, left.version),
        );

    for (const entry of versions) {
        const tools: string = path.join(packageDirectory, entry.name, "tools");

        if (hasRequiredTools(tools)) {
            return tools;
        }
    }

    throw new Error(
        `PQSDK_TEST_TOOLS_AUTODISCOVER found no stable SDK Tools version containing PQTest.exe and MakePQX.exe in ${packageDirectory}. No NuGet download will be attempted.`,
    );
}

export function initializeLocalSdkTools(enabled: boolean, environment: NodeJS.ProcessEnv = process.env): void {
    localToolsLocation = undefined;
    localToolsLocation = enabled ? resolveLocalSdkTools(environment) : undefined;
}

export function getLocalSdkToolsLocation(): string | undefined {
    return localToolsLocation;
}

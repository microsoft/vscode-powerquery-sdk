/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as path from "path";

import type { PqSdkNugetPackageService } from "../../common/PqSdkNugetPackageService";
import { ExtensionConstants } from "../../constants/PowerQuerySdkExtension";

interface PqSdkToolStartupOptions {
    readonly localToolsLocation?: string;
    readonly selectedToolsLocation: string | undefined;
    readonly selectedToolsReady: boolean;
    readonly packageService: Pick<
        PqSdkNugetPackageService,
        "findNullableNewPqSdkVersion" | "updatePqSdkFromNuget" | "cleanupUnusedPackages"
    >;
    readonly onPackageAcquired: (version: string) => void;
    readonly selectTools: (executablePath: string, version: string) => Promise<void>;
    readonly onAcquisitionFailed?: () => void;
    readonly promptForTools?: () => Promise<string | undefined>;
}

export async function initializePqSdkTools(options: PqSdkToolStartupOptions): Promise<string | undefined> {
    if (options.localToolsLocation) {
        return options.localToolsLocation;
    }

    // Reuse usable selected tools even if retention removed an unselected newer version.
    if (options.selectedToolsLocation && options.selectedToolsReady) {
        await options.packageService.cleanupUnusedPackages();

        return options.selectedToolsLocation;
    }

    const version: string =
        (await options.packageService.findNullableNewPqSdkVersion()) || ExtensionConstants.SuggestedPqTestNugetVersion;

    let executablePath: string | undefined = await options.packageService.updatePqSdkFromNuget(version);

    if (executablePath) {
        options.onPackageAcquired(version);
    } else {
        options.onAcquisitionFailed?.();
        executablePath = await options.promptForTools?.();
    }

    if (executablePath) {
        await options.selectTools(executablePath, version);

        return path.dirname(executablePath);
    }

    return undefined;
}

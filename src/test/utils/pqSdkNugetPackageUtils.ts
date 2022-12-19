/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as chai from "chai";
import * as fs from "fs";
import * as path from "path";

import {
    AWAIT_INTERVAL,
    buildPqSdkSubPath,
    MAX_AWAIT_TIME,
    MaximumPqTestNugetVersion,
    NugetPackagesDirectory,
    PqTestSubPath,
    PublicMsftPqSdkToolsNugetName,
} from "../common";

import { delay } from "../../utils/pids";
import { NugetLiteHttpService } from "../../common/nuget/NugetLiteHttpService";
import { NugetVersions } from "../../utils/NugetVersions";

const nugetHttpService = new NugetLiteHttpService();

const expect = chai.expect;

const MaximumPqTestNugetVersions: NugetVersions | undefined = MaximumPqTestNugetVersion
    ? NugetVersions.createFromFuzzyVersionString(MaximumPqTestNugetVersion)
    : undefined;

export module PqSdkNugetPackages {
    let latestPQSdkNugetVersion: NugetVersions | undefined = undefined;

    export function getExpectedPqSdkToolPath(maybeNextVersion?: string): string | undefined {
        const pqTestSubPath: string[] = maybeNextVersion ? buildPqSdkSubPath(maybeNextVersion) : PqTestSubPath;

        return path.resolve(NugetPackagesDirectory, ...pqTestSubPath);
    }

    export async function getAllPQSdkVersions(): Promise<NugetVersions[]> {
        const releasedVersions = await nugetHttpService.getSortedPackageReleasedVersions(
            PublicMsftPqSdkToolsNugetName,
            {
                maximumNugetVersion: MaximumPqTestNugetVersions,
            },
        );

        expect(releasedVersions.length).gt(0);

        return releasedVersions;
    }

    export async function assertPqSdkToolExisting(): Promise<void> {
        let i = 0;

        if (!latestPQSdkNugetVersion) {
            const allNugetVersions: NugetVersions[] = await getAllPQSdkVersions();

            // eslint-disable-next-line require-atomic-updates
            latestPQSdkNugetVersion = allNugetVersions[allNugetVersions.length - 1];
        }

        const mayBeExpectedPQSDKToolExePath: string | undefined = getExpectedPqSdkToolPath(
            latestPQSdkNugetVersion.toString(),
        );

        expect(typeof mayBeExpectedPQSDKToolExePath).eq("string");

        const expectedPqTestExePath: string = mayBeExpectedPQSDKToolExePath as string;

        while (i < MAX_AWAIT_TIME / AWAIT_INTERVAL) {
            i += 1;
            // eslint-disable-next-line no-await-in-loop
            await delay(AWAIT_INTERVAL);

            if (fs.existsSync(expectedPqTestExePath)) {
                expect(true).true;

                return;
            }
        }

        expect(false).true;
    }
}

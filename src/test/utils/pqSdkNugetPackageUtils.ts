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
    buildPqTestSubPath,
    MAX_AWAIT_TIME,
    NugetPackagesDirectory,
    PqTestSubPath,
    PublicMsftPqSdkToolsNugetName,
} from "../common";

import { delay } from "../../utils/pids";
import { NugetHttpService } from "../../common/NugetHttpService";
import { NugetVersions } from "../../utils/NugetVersions";

const nugetHttpService = new NugetHttpService();

const expect = chai.expect;

export module PqSdkNugetPackages {
    let latestPQSdkNugetVersion: NugetVersions | undefined = undefined;

    export function getExpectedPqSdkToolPath(maybeNextVersion?: string): string | undefined {
        const pqTestSubPath: string[] = maybeNextVersion ? buildPqTestSubPath(maybeNextVersion) : PqTestSubPath;

        return path.resolve(NugetPackagesDirectory, ...pqTestSubPath);
    }

    export async function getAllPQSdkVersions(): Promise<NugetVersions[]> {
        const releasedVersions = await nugetHttpService.getPackageReleasedVersions(PublicMsftPqSdkToolsNugetName);

        expect(releasedVersions.versions.length).gt(0);

        return releasedVersions.versions.map((releasedVersion: string) =>
            NugetVersions.createFromReleasedVersionString(releasedVersion),
        );
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

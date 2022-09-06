/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as chai from "chai";
import * as fs from "fs";
import * as path from "path";

import { Workbench } from "vscode-extension-tester";

import { ExtensionConstants } from "../../constants/PowerQuerySdkExtension";
import { NugetHttpService } from "../../common/NugetHttpService";

import { NugetVersions } from "../../utils/NugetVersions";

import { buildPqTestSubPath, extensionDevelopmentPath, NugetBaseFolder, PqTestSubPath } from "./common";
import { delay } from "../../utils/pids";

const expect = chai.expect;

const MAX_AWAIT_TIME: number = 2 * 60e3;
const AWAIT_INTERVAL: number = 5e3;

function getExpectedPqTestPath(maybeNextVersion?: string): string | undefined {
    const baseNugetFolder: string = path.resolve(extensionDevelopmentPath, NugetBaseFolder);

    const pqTestSubPath: string[] = maybeNextVersion ? buildPqTestSubPath(maybeNextVersion) : PqTestSubPath;

    return path.resolve(baseNugetFolder, ...pqTestSubPath);
}

describe("PQSdk Tool Acquisition Test", () => {
    const nugetHttpService = new NugetHttpService();

    it("Seize the latest by default.", async () => {
        const workbench = new Workbench();

        const packageName: string = ExtensionConstants.PublicMsftPqSdkToolsNugetName;
        const releasedVersions = await nugetHttpService.getPackageReleasedVersions(packageName);

        const nugetVersions: NugetVersions[] = releasedVersions.versions.map((releasedVersion: string) =>
            NugetVersions.createFromReleasedVersionString(releasedVersion),
        );

        expect(nugetVersions.length).gt(0);

        let i = 0;

        const mayBeExpectedPqTestExePath: string | undefined = getExpectedPqTestPath(
            nugetVersions[nugetVersions.length - 1].toString(),
        );

        expect(typeof mayBeExpectedPqTestExePath).eq("string");

        const expectedPqTestExePath: string = mayBeExpectedPqTestExePath as string;

        while (i < MAX_AWAIT_TIME / AWAIT_INTERVAL) {
            i += 1;
            // eslint-disable-next-line no-await-in-loop
            await delay(AWAIT_INTERVAL);

            if (fs.existsSync(expectedPqTestExePath)) {
                break;
            }
        }

        await workbench.executeCommand("power query: Update SDK Tool");

        await delay(3e3);

        expect(fs.existsSync(expectedPqTestExePath)).true;
    }).timeout(MAX_AWAIT_TIME);
});

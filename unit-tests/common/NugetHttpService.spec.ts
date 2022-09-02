/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as chai from "chai";
import * as fs from "fs";
import * as path from "path";

import { ExtensionConstants } from "../../src/constants/PowerQuerySdkExtension";
import { makeOneTmpDir } from "../../src/utils/osUtils";
import { NugetHttpService } from "../../src/common/NugetHttpService";
import { NugetVersions } from "../../src/utils/NugetVersions";
import { removeDirectoryRecursively } from "../../src/utils/files";

const expect = chai.expect;

describe("NugetHttpService", () => {
    const nugetHttpService = new NugetHttpService();

    it("getPackageReleasedVersions", async () => {
        const packageName: string = ExtensionConstants.PublicMsftPqSdkToolsNugetName;
        const preReleasedVersionIncludeVersions = await nugetHttpService.getPackageVersions(packageName);
        const releasedVersions = await nugetHttpService.getPackageReleasedVersions(packageName);
        expect(preReleasedVersionIncludeVersions.versions.length).gt(0);
        expect(releasedVersions.versions.length).gt(0);
        expect(preReleasedVersionIncludeVersions.versions.length).gte(releasedVersions.versions.length);
    });

    it("getLatestVersion", async () => {
        const packageName: string = ExtensionConstants.PublicMsftPqSdkToolsNugetName;
        const releasedVersions = await nugetHttpService.getPackageReleasedVersions(packageName);

        let nugetVersions: NugetVersions[] = releasedVersions.versions.map((releasedVersion: string) =>
            NugetVersions.createFromReleasedVersionString(releasedVersion),
        );

        const currentLength: number = nugetVersions.length;
        expect(currentLength).gt(0);
        nugetVersions = nugetVersions.sort(NugetVersions.compare);
        expect(nugetVersions[currentLength - 1].major).gte(nugetVersions[0].major);
    });

    it("downloadAndExtractNugetPackage", async () => {
        const packageName: string = ExtensionConstants.PublicMsftPqSdkToolsNugetName;
        const oneTmpDir = makeOneTmpDir();
        const allVersions = await nugetHttpService.getPackageReleasedVersions(packageName);
        const latestVersion: string = allVersions.versions[allVersions.versions.length - 1];

        const targetFilePath = path.join(oneTmpDir, `${packageName}.${latestVersion}`);
        await nugetHttpService.downloadAndExtractNugetPackage(packageName, latestVersion, targetFilePath);
        expect(fs.existsSync(path.join(targetFilePath, `${packageName}.nuspec`))).true;

        await removeDirectoryRecursively(oneTmpDir);
    }).timeout(0);
});

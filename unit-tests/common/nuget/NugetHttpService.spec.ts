/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as chai from "chai";
import * as fs from "fs";
import * as path from "path";

import { makeOneTmpDir } from "../../../src/utils/osUtils";
import { NugetHttpService } from "../../../src/common/nuget/NugetHttpService";
import { NugetVersions } from "../../../src/utils/NugetVersions";
import { tryRemoveDirectoryRecursively } from "../../../src/utils/files";

const expect = chai.expect;
const SdkPackageName = "Microsoft.PowerQuery.SdkTools";

describe("NugetHttpService unit testes", () => {
    const nugetHttpService = new NugetHttpService();

    it("getPackageReleasedVersions v1", async () => {
        const res = await nugetHttpService.getPackageReleasedVersions(SdkPackageName);
        expect(res.versions.length).gt(1);
    }).timeout(3e4);

    it("getSortedPackageReleasedVersions v1", async () => {
        const allVersions: NugetVersions[] = await nugetHttpService.getSortedPackageReleasedVersions(SdkPackageName);
        expect(allVersions.length).gt(1);

        const _2_110_Versions: NugetVersions[] = await nugetHttpService.getSortedPackageReleasedVersions(
            SdkPackageName,
            {
                maximumNugetVersion: NugetVersions.createFromFuzzyVersionString("2.110.x"),
            },
        );

        expect(_2_110_Versions.length).gt(1);
        expect(_2_110_Versions.length).lt(allVersions.length);
        expect(_2_110_Versions[_2_110_Versions.length - 1].minor).eq("110");
        expect(parseInt(allVersions[_2_110_Versions.length].minor, 10)).gt(110);
    }).timeout(3e4);

    it("downloadAndExtractNugetPackage v1", async () => {
        const oneTmpDir = makeOneTmpDir();
        const res = await nugetHttpService.getPackageReleasedVersions(SdkPackageName);
        expect(res.versions.length).gt(1);
        const theVersion = res.versions[res.versions.length - 1];
        await nugetHttpService.downloadAndExtractNugetPackage(SdkPackageName, theVersion, oneTmpDir);

        expect(fs.existsSync(path.resolve(oneTmpDir, "Microsoft.PowerQuery.SdkTools.nuspec"))).true;
        expect(fs.existsSync(path.resolve(oneTmpDir, "tools", "PQTest.exe"))).true;

        await tryRemoveDirectoryRecursively(oneTmpDir);
    }).timeout(3e4);
});

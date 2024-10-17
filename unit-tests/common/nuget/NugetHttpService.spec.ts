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
import { MAX_AWAIT_TIME } from "../../../src/test/common";
import { NugetHttpService } from "../../../src/common/nuget/NugetHttpService";
import { NugetVersions } from "../../../src/utils/NugetVersions";
import { PqSdkTestOutputChannel } from "../../../src/test/utils/pqSdkTestOutputChannel";
import { TestConstants } from "../testConstants";
import { tryRemoveDirectoryRecursively } from "../../../src/utils/files";

const expect = chai.expect;

describe(`${TestConstants.ExternalTestFlag} NugetHttpService unit tests`, () => {
    const testOutputChannel = new PqSdkTestOutputChannel();
    const nugetHttpService = new NugetHttpService(testOutputChannel);

    afterEach(() => testOutputChannel.emit());

    it("getPackageReleasedVersions v1", async () => {
        const res = await nugetHttpService.getPackageReleasedVersions(TestConstants.SdkPackageName);
        expect(res.versions.length).gt(1);
    }).timeout(MAX_AWAIT_TIME);

    it("getSortedPackageReleasedVersions v1", async () => {
        const allVersions: NugetVersions[] = await nugetHttpService.getSortedPackageReleasedVersions(
            TestConstants.SdkPackageName,
        );
        expect(allVersions.length).gt(1);

        const _2_110_Versions: NugetVersions[] = await nugetHttpService.getSortedPackageReleasedVersions(
            TestConstants.SdkPackageName,
            {
                maximumNugetVersion: NugetVersions.createFromFuzzyVersionString("2.110.x"),
            },
        );

        expect(_2_110_Versions.length).gt(1);
        expect(_2_110_Versions.length).lt(allVersions.length);
        expect(_2_110_Versions[_2_110_Versions.length - 1].minor).eq("110");
        expect(parseInt(allVersions[_2_110_Versions.length].minor, 10)).gt(110);
    }).timeout(MAX_AWAIT_TIME);

    it("downloadAndExtractNugetPackage v1", async () => {
        const oneTmpDir = makeOneTmpDir();
        const res = await nugetHttpService.getPackageReleasedVersions(TestConstants.SdkPackageName);
        expect(res.versions.length).gt(1);
        const theVersion = res.versions[res.versions.length - 1];
        await nugetHttpService.downloadAndExtractNugetPackage(TestConstants.SdkPackageName, theVersion, oneTmpDir);

        expect(fs.existsSync(path.resolve(oneTmpDir, "Microsoft.PowerQuery.SdkTools.nuspec"))).true;
        expect(fs.existsSync(path.resolve(oneTmpDir, "tools", "PQTest.exe"))).true;

        await tryRemoveDirectoryRecursively(oneTmpDir);
    }).timeout(MAX_AWAIT_TIME);
});

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as chai from "chai";
import * as fs from "fs";
import * as path from "path";

import { findExecutable } from "../../../src/utils/executables";
import { makeOneTmpDir } from "../../../src/utils/osUtils";
import { NugetCommandService } from "../../../src/common/nuget/NugetCommandService";
import { TestConstants } from "../testConstants";
import { tryRemoveDirectoryRecursively } from "../../../src/utils/files";

const expect = chai.expect;

describe(`${TestConstants.ExternalTestFlag} NugetCommandService unit tests`, () => {
    const nugetPath = findExecutable("nuget", [".exe", ""]);

    // disable these test cases for the ci due to auth config
    if (nugetPath && process.env.CI !== "true") {
        let oneTmpDir: string;
        let nugetCommandService: NugetCommandService;

        before(() => {
            oneTmpDir = makeOneTmpDir();
            nugetCommandService = new NugetCommandService(oneTmpDir);
        });

        it("getPackageReleasedVersions v1", async () => {
            const res = await nugetCommandService.getPackageReleasedVersions(
                nugetPath,
                TestConstants.InternalNugetFeed,
                TestConstants.SdkPackageName,
            );

            expect(res.length).gt(1);
        }).timeout(3e4);

        it("downloadAndExtractNugetPackage v1", async () => {
            const res = await nugetCommandService.getPackageReleasedVersions(
                nugetPath,
                TestConstants.InternalNugetFeed,
                TestConstants.SdkPackageName,
            );

            expect(res.length).gt(1);
            const theVersion = res[0];
            const theVersionStr = theVersion.toString();

            await nugetCommandService.downloadAndExtractNugetPackage(
                nugetPath,
                TestConstants.InternalNugetFeed,
                TestConstants.SdkPackageName,
                theVersionStr,
            );

            expect(
                fs.existsSync(
                    path.resolve(
                        oneTmpDir,
                        ".nuget",
                        `${TestConstants.SdkPackageName}.${theVersionStr}`,
                        `Microsoft.PowerQuery.SdkTools.${theVersionStr}.nupkg`,
                    ),
                ),
            ).true;

            expect(
                fs.existsSync(
                    path.resolve(
                        oneTmpDir,
                        ".nuget",
                        `${TestConstants.SdkPackageName}.${theVersionStr}`,
                        "tools",
                        "PQTest.exe",
                    ),
                ),
            ).true;

            await tryRemoveDirectoryRecursively(oneTmpDir);
        }).timeout(9e4);

        after(() => {
            setTimeout(() => {
                if (oneTmpDir) {
                    void tryRemoveDirectoryRecursively(oneTmpDir);
                    oneTmpDir = "";
                }
            }, 25);
        });
    }
});

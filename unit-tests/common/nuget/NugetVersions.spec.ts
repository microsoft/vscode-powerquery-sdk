/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as chai from "chai";
import { NugetVersions } from "../../../src/utils/NugetVersions";

const expect = chai.expect;

const dummyNugetVersionsArrV1 = [
    NugetVersions.createFromReleasedVersionString("2.2.1"),
    NugetVersions.createFromReleasedVersionString("1.1.0"),
    NugetVersions.createFromReleasedVersionString("1.3.0"),
    NugetVersions.createFromReleasedVersionString("1.2.0"),
    NugetVersions.createFromReleasedVersionString("2.0.0"),
    NugetVersions.createFromReleasedVersionString("2.1.1"),
    NugetVersions.createFromReleasedVersionString("2.1.0"),
    NugetVersions.createFromReleasedVersionString("1.2.1"),
    NugetVersions.createFromReleasedVersionString("1.0.0"),
    NugetVersions.createFromReleasedVersionString("2.2.0"),
].sort(NugetVersions.compare);

const dummyNugetVersionsArrV2 = [
    NugetVersions.createFromReleasedVersionString("2.116.201"),
    NugetVersions.createFromReleasedVersionString("2.114.4"),
    NugetVersions.createFromReleasedVersionString("2.112.4"),
    NugetVersions.createFromReleasedVersionString("2.112.3"),
    NugetVersions.createFromReleasedVersionString("2.111.5"),
    NugetVersions.createFromReleasedVersionString("2.111.3"),
    NugetVersions.createFromReleasedVersionString("2.110.3"),
    NugetVersions.createFromReleasedVersionString("2.110.2"),
    NugetVersions.createFromReleasedVersionString("2.110.1"),
    NugetVersions.createFromReleasedVersionString("2.109.6"),
].sort(NugetVersions.compare);

describe("NugetVersions.spec unit testes", () => {
    it("createFromReleasedVersionString v1", () => {
        const nugetVersions = NugetVersions.createFromReleasedVersionString("2.107.1");
        expect(nugetVersions.major).eq("2");
        expect(nugetVersions.minor).eq("107");
        expect(nugetVersions.patch).eq("1");
    });

    it("createFromFuzzyVersionString v1", () => {
        const nugetVersions = NugetVersions.createFromFuzzyVersionString("2.107.1");
        expect(nugetVersions.major).eq("2");
        expect(nugetVersions.minor).eq("107");
        expect(nugetVersions.patch).eq("1");
    });

    it("createFromFuzzyVersionString v2", () => {
        const nugetVersionsJunior = NugetVersions.createFromFuzzyVersionString("2.107.1");
        const nugetVersionsSenior = NugetVersions.createFromFuzzyVersionString("2.108.1");
        const nugetVersions = NugetVersions.createFromFuzzyVersionString("2.107.x");
        expect(nugetVersions.major).eq("2");
        expect(nugetVersions.minor).eq("107");
        expect(nugetVersions.patch).eq("x");
        expect(nugetVersionsJunior.compare(nugetVersions)).lt(0);
        expect(nugetVersionsSenior.compare(nugetVersions)).gt(0);
    });

    it("createFromFuzzyVersionString v3", () => {
        const nugetVersionsJunior = NugetVersions.createFromFuzzyVersionString("2.107.1");
        const nugetVersionsSenior = NugetVersions.createFromFuzzyVersionString("2.108.1");
        const nugetVersions = NugetVersions.createFromFuzzyVersionString("2.107");
        expect(nugetVersions.major).eq("2");
        expect(nugetVersions.minor).eq("107");
        expect(nugetVersions.patch).eq("");
        expect(nugetVersionsJunior.compare(nugetVersions)).lt(0);
        expect(nugetVersionsSenior.compare(nugetVersions)).gt(0);
    });

    it("createFromFuzzyVersionString v4", () => {
        const nugetVersionsJunior = NugetVersions.createFromFuzzyVersionString("2.108.1");
        const nugetVersionsSenior = NugetVersions.createFromFuzzyVersionString("3.108.1");
        const nugetVersions = NugetVersions.createFromFuzzyVersionString("2.x");
        expect(nugetVersions.major).eq("2");
        expect(nugetVersions.minor).eq("x");
        expect(nugetVersions.patch).eq("");
        expect(nugetVersionsJunior.compare(nugetVersions)).lt(0);
        expect(nugetVersionsSenior.compare(nugetVersions)).gt(0);
    });

    it("createFromFuzzyVersionString v5", () => {
        const nugetVersionsJunior = NugetVersions.createFromFuzzyVersionString("2.108.1");
        const nugetVersionsSenior = NugetVersions.createFromFuzzyVersionString("3.108.1");
        const nugetVersions = NugetVersions.createFromFuzzyVersionString("2");
        expect(nugetVersions.major).eq("2");
        expect(nugetVersions.minor).eq("");
        expect(nugetVersions.patch).eq("");
        expect(nugetVersionsJunior.compare(nugetVersions)).lt(0);
        expect(nugetVersionsSenior.compare(nugetVersions)).gt(0);
    });

    it("findClosestVersion v1", () => {
        let expectedNugetVersion = NugetVersions.createFromFuzzyVersionString("1.2.1");
        let closestNuGetVersion = NugetVersions.findClosetAmong(dummyNugetVersionsArrV1, expectedNugetVersion);
        expect(closestNuGetVersion.major).eq("1");
        expect(closestNuGetVersion.minor).eq("2");
        expect(closestNuGetVersion.patch).eq("1");

        expectedNugetVersion = NugetVersions.createFromFuzzyVersionString("1.3.3");
        closestNuGetVersion = NugetVersions.findClosetAmong(dummyNugetVersionsArrV1, expectedNugetVersion);
        expect(closestNuGetVersion.major).eq("1");
        expect(closestNuGetVersion.minor).eq("3");
        expect(closestNuGetVersion.patch).eq("0");
    });

    it("findClosestVersion v2", () => {
        let expectedNugetVersion = NugetVersions.createFromFuzzyVersionString("2.114.4");
        let closestNuGetVersion = NugetVersions.findClosetAmong(dummyNugetVersionsArrV2, expectedNugetVersion);
        expect(closestNuGetVersion.major).eq("2");
        expect(closestNuGetVersion.minor).eq("114");
        expect(closestNuGetVersion.patch).eq("4");

        expectedNugetVersion = NugetVersions.createFromFuzzyVersionString("2");
        closestNuGetVersion = NugetVersions.findClosetAmong(dummyNugetVersionsArrV2, expectedNugetVersion);
        expect(closestNuGetVersion.major).eq("2");
        expect(closestNuGetVersion.minor).eq("116");
        expect(closestNuGetVersion.patch).eq("201");

        expectedNugetVersion = NugetVersions.createFromFuzzyVersionString("2.");
        closestNuGetVersion = NugetVersions.findClosetAmong(dummyNugetVersionsArrV2, expectedNugetVersion);
        expect(closestNuGetVersion.major).eq("2");
        expect(closestNuGetVersion.minor).eq("116");
        expect(closestNuGetVersion.patch).eq("201");

        expectedNugetVersion = NugetVersions.createFromFuzzyVersionString("2.1");
        closestNuGetVersion = NugetVersions.findClosetAmong(dummyNugetVersionsArrV2, expectedNugetVersion);
        expect(closestNuGetVersion.major).eq("2");
        expect(closestNuGetVersion.minor).eq("109");
        expect(closestNuGetVersion.patch).eq("6");

        expectedNugetVersion = NugetVersions.createFromFuzzyVersionString("2.11");
        closestNuGetVersion = NugetVersions.findClosetAmong(dummyNugetVersionsArrV2, expectedNugetVersion);
        expect(closestNuGetVersion.major).eq("2");
        expect(closestNuGetVersion.minor).eq("109");
        expect(closestNuGetVersion.patch).eq("6");

        expectedNugetVersion = NugetVersions.createFromFuzzyVersionString("2.110");
        closestNuGetVersion = NugetVersions.findClosetAmong(dummyNugetVersionsArrV2, expectedNugetVersion);
        expect(closestNuGetVersion.major).eq("2");
        expect(closestNuGetVersion.minor).eq("110");
        expect(closestNuGetVersion.patch).eq("3");

        expectedNugetVersion = NugetVersions.createFromFuzzyVersionString("2.110.");
        closestNuGetVersion = NugetVersions.findClosetAmong(dummyNugetVersionsArrV2, expectedNugetVersion);
        expect(closestNuGetVersion.major).eq("2");
        expect(closestNuGetVersion.minor).eq("110");
        expect(closestNuGetVersion.patch).eq("3");

        expectedNugetVersion = NugetVersions.createFromFuzzyVersionString("2.110.x");
        closestNuGetVersion = NugetVersions.findClosetAmong(dummyNugetVersionsArrV2, expectedNugetVersion);
        expect(closestNuGetVersion.major).eq("2");
        expect(closestNuGetVersion.minor).eq("110");
        expect(closestNuGetVersion.patch).eq("3");

        expectedNugetVersion = NugetVersions.createFromFuzzyVersionString("2.110.4");
        closestNuGetVersion = NugetVersions.findClosetAmong(dummyNugetVersionsArrV2, expectedNugetVersion);
        expect(closestNuGetVersion.major).eq("2");
        expect(closestNuGetVersion.minor).eq("110");
        expect(closestNuGetVersion.patch).eq("3");

        expectedNugetVersion = NugetVersions.createFromFuzzyVersionString("2.115");
        closestNuGetVersion = NugetVersions.findClosetAmong(dummyNugetVersionsArrV2, expectedNugetVersion);
        expect(closestNuGetVersion.major).eq("2");
        expect(closestNuGetVersion.minor).eq("114");
        expect(closestNuGetVersion.patch).eq("4");

        expectedNugetVersion = NugetVersions.createFromFuzzyVersionString("2.115.1000000000000000000");
        closestNuGetVersion = NugetVersions.findClosetAmong(dummyNugetVersionsArrV2, expectedNugetVersion);
        expect(closestNuGetVersion.major).eq("2");
        expect(closestNuGetVersion.minor).eq("114");
        expect(closestNuGetVersion.patch).eq("4");

        expectedNugetVersion = NugetVersions.createFromFuzzyVersionString("2.116");
        closestNuGetVersion = NugetVersions.findClosetAmong(dummyNugetVersionsArrV2, expectedNugetVersion);
        expect(closestNuGetVersion.major).eq("2");
        expect(closestNuGetVersion.minor).eq("116");
        expect(closestNuGetVersion.patch).eq("201");

        expectedNugetVersion = NugetVersions.createFromFuzzyVersionString("2.116.201");
        closestNuGetVersion = NugetVersions.findClosetAmong(dummyNugetVersionsArrV2, expectedNugetVersion);
        expect(closestNuGetVersion.major).eq("2");
        expect(closestNuGetVersion.minor).eq("116");
        expect(closestNuGetVersion.patch).eq("201");
    });

    it("filter out nuget version arr v1", () => {
        let maximumPqTestNugetVersion: NugetVersions = NugetVersions.createFromFuzzyVersionString("2.112.x");
        let minimumPqTestNugetVersion: NugetVersions = NugetVersions.createFromFuzzyVersionString("2.110.x");

        let filteredVersion = dummyNugetVersionsArrV2;

        filteredVersion = filteredVersion.filter((one: NugetVersions) => one.compare(maximumPqTestNugetVersion) <= 0);

        filteredVersion = filteredVersion.filter((one: NugetVersions) => minimumPqTestNugetVersion.compare(one) <= 0);

        expect(filteredVersion.length === 4).ok;
        expect(filteredVersion[0].major).eq("2");
        expect(filteredVersion[0].minor).eq("111");
        expect(filteredVersion[0].patch).eq("3");
        expect(filteredVersion[3].major).eq("2");
        expect(filteredVersion[3].minor).eq("112");
        expect(filteredVersion[3].patch).eq("4");
    });
});

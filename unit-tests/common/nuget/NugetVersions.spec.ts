/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as chai from "chai";
import { NugetVersions } from "../../../src/utils/NugetVersions";

const expect = chai.expect;

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
});

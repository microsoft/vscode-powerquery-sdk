/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { expect } from "chai";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { getLocalSdkToolsLocation, initializeLocalSdkTools, resolveLocalSdkTools } from "../src/utils/localSdkTools";

describe("Local SDK Tools override", () => {
    let root: string;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "pq-local-tools-"));
        fs.writeFileSync(path.join(root, "PQTest.exe"), "");
        fs.writeFileSync(path.join(root, "MakePQX.exe"), "");
    });

    afterEach(() => {
        initializeLocalSdkTools(false);
        fs.rmSync(root, { recursive: true, force: true });
    });

    it("selects an existing extracted tools directory", () => {
        initializeLocalSdkTools(true, { PQSDK_TEST_TOOLS_PATH: root });
        expect(getLocalSdkToolsLocation()).to.equal(root);
    });

    it("ignores the override outside development and test hosts", () => {
        initializeLocalSdkTools(false, { PQSDK_TEST_TOOLS_PATH: "invalid", PQSDK_TEST_TOOLS_AUTODISCOVER: "1" });
        expect(getLocalSdkToolsLocation()).to.be.undefined;
    });

    it("leaves acquisition unchanged when the variable is absent", () => {
        initializeLocalSdkTools(true, {});
        expect(getLocalSdkToolsLocation()).to.be.undefined;
    });

    it("rejects empty and relative paths instead of silently falling back", () => {
        expect(() => initializeLocalSdkTools(true, { PQSDK_TEST_TOOLS_PATH: "" })).to.throw("absolute path");
        expect(() => initializeLocalSdkTools(true, { PQSDK_TEST_TOOLS_PATH: "relative" })).to.throw("absolute path");
    });

    it("rejects a directory missing the build tool", () => {
        fs.unlinkSync(path.join(root, "MakePQX.exe"));
        expect(() => initializeLocalSdkTools(true, { PQSDK_TEST_TOOLS_PATH: root })).to.throw("MakePQX.exe");
        expect(getLocalSdkToolsLocation()).to.be.undefined;
    });

    it("rejects directories named like executables", () => {
        fs.unlinkSync(path.join(root, "PQTest.exe"));
        fs.mkdirSync(path.join(root, "PQTest.exe"));
        expect(() => initializeLocalSdkTools(true, { PQSDK_TEST_TOOLS_PATH: root })).to.throw("PQTest.exe");
    });

    function addCachedTools(cache: string, version: string): string {
        const tools = path.join(cache, "microsoft.powerquery.sdktools", version, "tools");
        fs.mkdirSync(tools, { recursive: true });
        fs.writeFileSync(path.join(tools, "PQTest.exe"), "");
        fs.writeFileSync(path.join(tools, "MakePQX.exe"), "");

        return tools;
    }

    it("selects the latest stable version numerically from NUGET_PACKAGES", () => {
        addCachedTools(root, "2.9.0");
        const latest = addCachedTools(root, "2.10.1");
        addCachedTools(root, "2.10.0");
        addCachedTools(root, "3.0.0-preview.1");
        addCachedTools(root, "not-a-version");

        expect(resolveLocalSdkTools({ PQSDK_TEST_TOOLS_AUTODISCOVER: "1", NUGET_PACKAGES: root })).to.equal(latest);
        initializeLocalSdkTools(true, { PQSDK_TEST_TOOLS_AUTODISCOVER: "1", NUGET_PACKAGES: root });
        expect(getLocalSdkToolsLocation()).to.equal(latest);
    });

    it("skips incomplete cached packages rather than selecting missing tools", () => {
        const latest = addCachedTools(root, "2.10.0");
        const incomplete = addCachedTools(root, "2.11.0");
        fs.unlinkSync(path.join(incomplete, "MakePQX.exe"));
        const malformed = path.join(root, "microsoft.powerquery.sdktools", "2.12.0");
        fs.mkdirSync(malformed);
        fs.writeFileSync(path.join(malformed, "tools"), "");

        expect(resolveLocalSdkTools({ PQSDK_TEST_TOOLS_AUTODISCOVER: "1", NUGET_PACKAGES: root })).to.equal(latest);
    });

    it("uses the default user cache only when NUGET_PACKAGES is unset", () => {
        const tools = addCachedTools(path.join(root, ".nuget", "packages"), "2.160.4");

        expect(resolveLocalSdkTools({ PQSDK_TEST_TOOLS_AUTODISCOVER: "1" }, root)).to.equal(tools);

        expect(() =>
            resolveLocalSdkTools(
                { PQSDK_TEST_TOOLS_AUTODISCOVER: "1", NUGET_PACKAGES: path.join(root, "missing") },
                root,
            ),
        ).to.throw("No NuGet download");
    });

    it("prefers an explicit tools directory over autodiscovery", () => {
        expect(
            resolveLocalSdkTools({
                PQSDK_TEST_TOOLS_PATH: root,
                PQSDK_TEST_TOOLS_AUTODISCOVER: "1",
                NUGET_PACKAGES: "invalid",
            }),
        ).to.equal(root);
    });

    it("does not hide an invalid explicit override by discovering another package", () => {
        addCachedTools(root, "2.160.4");

        expect(() =>
            resolveLocalSdkTools({
                PQSDK_TEST_TOOLS_PATH: "",
                PQSDK_TEST_TOOLS_AUTODISCOVER: "1",
                NUGET_PACKAGES: root,
            }),
        ).to.throw("absolute path");
    });

    it("rejects invalid cache paths and caches without a usable stable package", () => {
        expect(() => resolveLocalSdkTools({ PQSDK_TEST_TOOLS_AUTODISCOVER: "1", NUGET_PACKAGES: "" })).to.throw(
            "NUGET_PACKAGES must be an absolute path",
        );

        expect(() => resolveLocalSdkTools({ PQSDK_TEST_TOOLS_AUTODISCOVER: "1", NUGET_PACKAGES: "relative" })).to.throw(
            "NUGET_PACKAGES must be an absolute path",
        );

        addCachedTools(root, "2.160.4-preview.1");

        expect(() => resolveLocalSdkTools({ PQSDK_TEST_TOOLS_AUTODISCOVER: "1", NUGET_PACKAGES: root })).to.throw(
            "no stable SDK Tools version",
        );
    });

    it("does not inspect the cache unless discovery is explicitly enabled", () => {
        expect(resolveLocalSdkTools({ PQSDK_TEST_TOOLS_AUTODISCOVER: "0", NUGET_PACKAGES: "invalid" })).to.be.undefined;
    });
});

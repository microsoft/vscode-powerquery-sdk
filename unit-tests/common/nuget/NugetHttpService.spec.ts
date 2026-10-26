/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import axios, { AxiosInstance } from "axios";
import { expect } from "chai";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";
import { Readable } from "stream";

import { NugetHttpService } from "../../../src/common/nuget/NugetHttpService";
import { ExtensionConstants } from "../../../src/constants/PowerQuerySdkExtension";
import { NugetVersions } from "../../../src/utils/NugetVersions";
import { TestConstants } from "../testConstants";

// A real ZIP containing a nuspec and a placeholder executable, not downloaded SDK binaries.
const packageZip = Buffer.from(
    "UEsDBBQAAAAIAAAAIVC61AEsEwAAAAsAAAAkAAAATWljcm9zb2Z0LlBvd2VyUXVlcnkuU2RrVG9vbHMubnVzcGVjsilITM5OTE9V0LcDAAAA//8DAFBLAwQUAAAACAAAACFQ4UzL6hcAAAAPAAAAEAAAAHRvb2xzL1BRVGVzdC5leGXKzU/OVkitSE0uLUlMykkFAAAA//8DAFBLAQIUABQAAAAIAAAAIVC61AEsEwAAAAsAAAAkAAAAAAAAAAAAAAAAAAAAAABNaWNyb3NvZnQuUG93ZXJRdWVyeS5TZGtUb29scy5udXNwZWNQSwECFAAUAAAACAAAACFQ4UzL6hcAAAAPAAAAEAAAAAAAAAAAAAAAAABVAAAAdG9vbHMvUFFUZXN0LmV4ZVBLBQYAAAAAAgACAJAAAACaAAAAAAA=",
    "base64",
);

describe("NugetHttpService unit tests (offline)", () => {
    let service: NugetHttpService;
    let instance: AxiosInstance;
    let get: sinon.SinonStub;
    let root: string;
    let clock: sinon.SinonFakeTimers;
    let appendErrorLine: sinon.SinonSpy;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "pq-http-"));
        instance = axios.create();
        get = sinon.stub(instance, "get").callsFake(async () => ({
            data: { versions: ["2.111.1", "2.110.2", "2.109.1", "2.110.1", "2.112.0-preview"] },
        }));
        sinon.stub(axios, "create").returns(instance);
        appendErrorLine = sinon.spy();
        clock = sinon.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        service = new NugetHttpService({ appendErrorLine, appendInfoLine: sinon.spy() });
    });

    afterEach(async () => {
        await clock.tickAsync(4000);
        sinon.restore();
        fs.rmSync(root, { recursive: true, force: true });
    });

    it("requests the package index and filters prerelease versions", async () => {
        const result = await service.getPackageReleasedVersions(TestConstants.SdkPackageName);

        expect(get.firstCall.args[0]).to.equal("v3-flatcontainer/microsoft.powerquery.sdktools/index.json");
        expect(result.versions).to.deep.equal(["2.111.1", "2.110.2", "2.109.1", "2.110.1"]);
    });

    it("sorts and applies minimum and fuzzy maximum version bounds", async () => {
        const all = await service.getSortedPackageReleasedVersions(TestConstants.SdkPackageName);
        expect(all.map(version => version.toString())).to.deep.equal(["2.109.1", "2.110.1", "2.110.2", "2.111.1"]);

        const bounded = await service.getSortedPackageReleasedVersions(TestConstants.SdkPackageName, {
            minimumNugetVersion: NugetVersions.createFromReleasedVersionString("2.110.1"),
            maximumNugetVersion: NugetVersions.createFromFuzzyVersionString("2.110.x"),
        });
        expect(bounded.map(version => version.toString())).to.deep.equal(["2.110.1", "2.110.2"]);
    });

    it("includes all patches through the configured SDK Tools maximum but excludes newer minor versions", async () => {
        get.resolves({ data: { versions: ["3.0.0", "2.171.0", "2.170.999", "2.170.1", "2.170.0", "2.169.5"] } });

        expect(ExtensionConstants.MaximumPqTestNugetVersion).to.equal("2.170.x");

        const bounded = await service.getSortedPackageReleasedVersions(TestConstants.SdkPackageName, {
            maximumNugetVersion: NugetVersions.createFromFuzzyVersionString(
                ExtensionConstants.MaximumPqTestNugetVersion,
            ),
        });

        expect(bounded.map(version => version.toString())).to.deep.equal([
            "2.169.5",
            "2.170.0",
            "2.170.1",
            "2.170.999",
        ]);
    });

    it("downloads a mocked package stream and extracts the real ZIP locally", async () => {
        get.resolves({ data: Readable.from(packageZip) });

        await service.downloadAndExtractNugetPackage(TestConstants.SdkPackageName, "2.110.2", root);

        expect(get.firstCall.args).to.deep.equal([
            "v3-flatcontainer/microsoft.powerquery.sdktools/2.110.2/microsoft.powerquery.sdktools.2.110.2.nupkg",
            { responseType: "stream" },
        ]);
        expect(fs.readFileSync(path.join(root, "Microsoft.PowerQuery.SdkTools.nuspec"), "utf8")).to.equal(
            "<package />",
        );
        expect(fs.readFileSync(path.join(root, "tools", "PQTest.exe"), "utf8")).to.equal("mock executable");
    });

    it("logs and propagates feed failures rather than requiring a real feed", async () => {
        const failure = new Error("feed unavailable");
        get.rejects(failure);
        let caught: unknown;

        try {
            await service.getPackageReleasedVersions(TestConstants.SdkPackageName);
        } catch (error: unknown) {
            caught = error;
        }

        expect(caught).to.equal(failure);
        expect(appendErrorLine.calledOnce).to.be.true;
    });

    it("configures the proxy without sending network requests", () => {
        service.updateAxiosInstance("https://example.invalid", "http://localhost:8080", "test-authorization");

        expect(axios.create).to.have.property("callCount", 3);
        expect(instance.defaults.headers.common["Authorization"]).to.equal("test-authorization");
        expect(get.called).to.be.false;
    });
});

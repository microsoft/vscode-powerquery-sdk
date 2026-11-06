/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { expect } from "chai";
import cp = require("child_process");
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";
import { PassThrough } from "stream";

import { NugetCommandService } from "../../../src/common/nuget/NugetCommandService";
import { NugetVersions } from "../../../src/utils/NugetVersions";
import { TestConstants } from "../testConstants";

describe("NugetCommandService unit tests (offline)", () => {
    let root: string;
    let service: NugetCommandService;
    let spawn: sinon.SinonStub;
    let child: cp.ChildProcess;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "pq-command-"));
        service = new NugetCommandService(root);
        child = new cp.ChildProcess();
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();
        spawn = sinon.stub(cp, "spawn").callsFake(() => {
            process.nextTick(() => {
                child.stdout?.emit(
                    "data",
                    Buffer.from("Microsoft.PowerQuery.SdkTools 2.110.2\nMicrosoft.PowerQuery.SdkTools 2.109.1\n"),
                );
                child.emit("close", 0, null);
            });

            return child;
        });
    });

    afterEach(() => {
        sinon.restore();
        child.stdout?.destroy();
        child.stderr?.destroy();
        fs.rmSync(root, { recursive: true, force: true });
    });

    it("lists versions using the configured executable and feed without spawning a process", async () => {
        const versions = await service.getPackageReleasedVersions(
            "nuget.exe",
            "https://example.invalid/feed",
            TestConstants.SdkPackageName,
        );

        expect(versions.map(version => version.toString())).to.deep.equal(["2.110.2", "2.109.1"]);
        expect(spawn.firstCall.args[0]).to.equal("nuget.exe");
        expect(spawn.firstCall.args[1]).to.deep.equal([
            "list",
            TestConstants.SdkPackageName,
            "-AllVersions",
            "-Source",
            "https://example.invalid/feed",
        ]);
        expect(spawn.firstCall.args[2].cwd).to.equal(path.join(root, ".nuget"));
    });

    it("sorts and filters the mocked command output", async () => {
        const versions = await service.getSortedPackageReleasedVersions(
            "nuget.exe",
            undefined,
            TestConstants.SdkPackageName,
            { maximumNugetVersion: NugetVersions.createFromFuzzyVersionString("2.109.x") },
        );

        expect(versions.map(version => version.toString())).to.deep.equal(["2.109.1"]);
        expect(spawn.firstCall.args[1]).not.to.include("-Source");
    });

    it("installs a specific version into the managed cache and returns its executable", async () => {
        const executable = service.expectedPackagePath(TestConstants.SdkPackageName, "2.110.2");
        fs.mkdirSync(path.dirname(executable), { recursive: true });
        fs.writeFileSync(executable, "mock executable");

        const result = await service.downloadAndExtractNugetPackage(
            "nuget.exe",
            "https://example.invalid/feed",
            TestConstants.SdkPackageName,
            "2.110.2",
        );

        expect(result).to.equal(executable);
        expect(spawn.firstCall.args[1]).to.deep.equal([
            "install",
            TestConstants.SdkPackageName,
            "-Version",
            "2.110.2",
            "-OutputDirectory",
            path.join(root, ".nuget"),
            "-Source",
            "https://example.invalid/feed",
        ]);
    });

    it("returns no executable when installation does not produce one", async () => {
        const result = await service.downloadAndExtractNugetPackage(
            "nuget.exe",
            undefined,
            TestConstants.SdkPackageName,
            "2.110.2",
        );

        expect(result).to.be.undefined;
    });

    it("propagates process errors without using installed tools", async () => {
        const failure = new Error("nuget unavailable");
        spawn.callsFake(() => {
            process.nextTick(() => child.emit("error", failure));

            return child;
        });
        let caught: unknown;

        try {
            await service.getPackageReleasedVersions("nuget.exe", undefined, TestConstants.SdkPackageName);
        } catch (error: unknown) {
            caught = error;
        }

        expect(caught).to.equal(failure);
    });
});

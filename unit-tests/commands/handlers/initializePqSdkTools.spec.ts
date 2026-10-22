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

import { initializePqSdkTools } from "../../../src/commands/handlers/initializePqSdkTools";
import { ExtensionConstants } from "../../../src/constants/PowerQuerySdkExtension";
import { cleanupNugetPackages } from "../../../src/utils/nugetPackageRetention";
import processIdentity = require("../../../src/utils/processIdentity");

describe("SDK tool startup", () => {
    let root: string;
    let cache: string;
    let findVersion: sinon.SinonStub;
    let acquire: sinon.SinonStub;
    let cleanup: sinon.SinonStub;
    let onPackageAcquired: sinon.SinonSpy;
    let selectTools: sinon.SinonStub;
    let queryProcess: sinon.SinonStub;

    beforeEach(() => {
        sinon.stub(processIdentity, "getProcessCreationTime").returns("123");
        queryProcess = sinon
            .stub(cp, "spawnSync")
            .throws(new Error("Startup unit tests must not query real processes"));
        root = fs.mkdtempSync(path.join(os.tmpdir(), "pq-startup-"));
        cache = path.join(root, ".nuget");
        fs.mkdirSync(cache);
        findVersion = sinon.stub().resolves("2.160.2");
        acquire = sinon.stub().resolves(undefined);
        cleanup = sinon.stub().resolves();
        onPackageAcquired = sinon.spy();
        selectTools = sinon.stub().resolves();
    });

    afterEach(() => {
        sinon.restore();
        fs.rmSync(root, { recursive: true, force: true });
    });

    function addPackage(version: string): string {
        const tools = path.join(cache, `${ExtensionConstants.InternalMsftPqSdkToolsNugetName}.${version}`, "tools");
        fs.mkdirSync(tools, { recursive: true });
        fs.writeFileSync(path.join(tools, "PQTest.exe"), "");

        return tools;
    }

    function options(
        selectedToolsLocation: string | undefined,
        selectedToolsReady: boolean,
    ): Parameters<typeof initializePqSdkTools>[0] {
        return {
            selectedToolsLocation,
            selectedToolsReady,
            packageService: {
                findNullableNewPqSdkVersion: findVersion,
                updatePqSdkFromNuget: acquire,
                cleanupUnusedPackages: cleanup,
            },
            onPackageAcquired,
            selectTools,
        };
    }

    it("preserves an older selection across both activations after pruning the newer cache with retention one", async () => {
        const selected = addPackage("2.159.1");
        const newer = addPackage("2.160.2");
        cleanup.callsFake(() => cleanupNugetPackages(cache, selected, 1));

        for (let activation = 0; activation < 2; activation++) {
            const ready = fs.existsSync(path.join(selected, "PQTest.exe"));
            expect(await initializePqSdkTools(options(selected, ready))).to.equal(selected);
            expect(fs.existsSync(newer)).to.be.false;
            expect(fs.existsSync(path.join(selected, "PQTest.exe"))).to.be.true;
        }

        expect(cleanup.callCount).to.equal(2);
        expect(findVersion.called).to.be.false;
        expect(acquire.called).to.be.false;
        expect(onPackageAcquired.called).to.be.false;
        expect(selectTools.called).to.be.false;
        expect(queryProcess.called).to.be.false;
    });

    it("acquires and selects tools when the current selection is not usable", async () => {
        const tools = addPackage("2.160.2");
        const executable = path.join(tools, "PQTest.exe");
        acquire.resolves(executable);

        expect(await initializePqSdkTools(options(tools, false))).to.equal(tools);

        sinon.assert.callOrder(findVersion, acquire, onPackageAcquired, selectTools);
        expect(acquire.calledOnceWithExactly("2.160.2")).to.be.true;
        expect(selectTools.calledOnceWithExactly(executable, "2.160.2")).to.be.true;
    });

    it("returns the newly selected location rather than the previous unusable selection", async () => {
        const previous = addPackage("2.159.1");
        const next = addPackage("2.160.2");
        acquire.resolves(path.join(next, "PQTest.exe"));

        expect(await initializePqSdkTools(options(previous, false))).to.equal(next);
    });

    it("does not report an unusable previous selection as success after acquisition fails", async () => {
        const previous = addPackage("2.159.1");

        expect(await initializePqSdkTools(options(previous, false))).to.be.undefined;
        expect(selectTools.called).to.be.false;
        expect(cleanup.called).to.be.false;
    });

    it("prompts only after acquisition fails and does not copy a missing package schema", async () => {
        const promptForTools = sinon.stub().resolves(path.join(root, "custom", "PQTest.exe"));

        await initializePqSdkTools({ ...options(undefined, false), promptForTools });

        sinon.assert.callOrder(acquire, promptForTools, selectTools);
        expect(onPackageAcquired.called).to.be.false;
        expect(cleanup.called).to.be.false;
    });

    it("does not select tools or clean packages after unsuccessful acquisition without a prompt", async () => {
        await initializePqSdkTools(options(undefined, false));

        expect(selectTools.called).to.be.false;
        expect(cleanup.called).to.be.false;
    });

    it("propagates acquisition errors without cleaning the cache", async () => {
        const failure = new Error("feed unavailable");
        acquire.rejects(failure);
        let caught: unknown;

        try {
            await initializePqSdkTools(options(undefined, false));
        } catch (error: unknown) {
            caught = error;
        }

        expect(caught).to.equal(failure);
        expect(selectTools.called).to.be.false;
        expect(cleanup.called).to.be.false;
    });
});

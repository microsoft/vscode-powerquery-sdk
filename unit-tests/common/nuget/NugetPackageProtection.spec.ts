/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { expect } from "chai";
import fs = require("fs");
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";

import { initializePqSdkTools } from "../../../src/commands/handlers/initializePqSdkTools";
import { ExtensionConstants } from "../../../src/constants/PowerQuerySdkExtension";
import { NugetPackageProtection } from "../../../src/utils/NugetPackageProtection";

describe("Retryable SDK package protection", () => {
    let root: string;
    let cache: string;
    let tools: string;
    let guard: string;
    let protection: NugetPackageProtection;
    let clock: sinon.SinonFakeTimers;
    let appendInfoLine: sinon.SinonSpy;
    let appendErrorLine: sinon.SinonSpy;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "pq-protection-"));
        cache = path.join(root, ".nuget");
        const packageName = `${ExtensionConstants.InternalMsftPqSdkToolsNugetName}.2.159.1`;
        tools = path.join(cache, packageName, "tools");
        fs.mkdirSync(tools, { recursive: true });
        fs.writeFileSync(path.join(tools, "PQTest.exe"), "");
        const usage = path.join(cache, ".sdk-package-usage", packageName);
        fs.mkdirSync(usage, { recursive: true });
        guard = path.join(usage, `cleanup-${process.pid}-00000000-0000-0000-0000-000000000000`);
        fs.writeFileSync(guard, "");
        clock = sinon.useFakeTimers();
        protection = new NugetPackageProtection();
        appendInfoLine = sinon.spy();
        appendErrorLine = sinon.spy();
        protection.setOutputChannel({ appendInfoLine, appendErrorLine });
    });

    afterEach(() => {
        protection.dispose();
        sinon.restore();
        fs.rmSync(root, { recursive: true, force: true });
    });

    it("defers directory and direct-executable exposure without throwing, and refreshes consumers after recovery", async () => {
        const executable = path.join(tools, "PQTest.exe");
        const readDirectory = () => protection.getProtectedLocation(cache, tools);
        const readExecutable = () =>
            protection.getProtectedLocation(cache, path.dirname(executable)) ? executable : undefined;
        let exposedDirectory: string | undefined;
        let exposedExecutable: string | undefined;
        const refresh = sinon.spy(() => {
            exposedDirectory = readDirectory();
            exposedExecutable = readExecutable();
        });
        protection.subscribeOneEvent("recovered", refresh);

        expect(readDirectory()).to.be.undefined;
        expect(readExecutable()).to.be.undefined;
        expect(appendInfoLine.calledOnce).to.be.true;
        expect(clock.countTimers()).to.equal(1);
        await clock.tickAsync(300);
        expect(refresh.called).to.be.false;
        expect(readDirectory()).to.be.undefined;

        const ready = protection.waitForPending();
        fs.unlinkSync(guard);
        await clock.tickAsync(100);
        await ready;

        expect(refresh.calledOnce).to.be.true;
        expect(exposedDirectory).to.equal(tools);
        expect(exposedExecutable).to.equal(executable);
        expect(clock.countTimers()).to.equal(0);
        expect(appendErrorLine.called).to.be.false;
    });

    it("waits before startup decides whether to acquire tools and preserves a usable selection after contention", async () => {
        expect(protection.getProtectedLocation(cache, tools)).to.be.undefined;
        const findVersion = sinon.stub().resolves("2.160.2");
        const acquire = sinon.stub().resolves(undefined);
        const cleanup = sinon.stub().resolves();
        const initialize = async () => {
            await protection.waitForPending();
            const location = protection.getProtectedLocation(cache, tools);

            return initializePqSdkTools({
                selectedToolsLocation: location,
                selectedToolsReady: Boolean(location && fs.existsSync(path.join(location, "PQTest.exe"))),
                packageService: {
                    findNullableNewPqSdkVersion: findVersion,
                    updatePqSdkFromNuget: acquire,
                    cleanupUnusedPackages: cleanup,
                },
                onPackageAcquired: sinon.spy(),
                selectTools: sinon.stub().resolves(),
            });
        };
        const starting = initialize();
        await clock.tickAsync(200);
        expect(findVersion.called).to.be.false;
        expect(acquire.called).to.be.false;
        expect(cleanup.called).to.be.false;

        fs.unlinkSync(guard);
        await clock.tickAsync(100);

        expect(await starting).to.equal(tools);
        expect(cleanup.calledOnce).to.be.true;
        expect(findVersion.called).to.be.false;
        expect(acquire.called).to.be.false;
    });

    it("reacquires removed tools only after deletion finishes", async () => {
        expect(protection.getProtectedLocation(cache, tools)).to.be.undefined;
        const ready = protection.waitForPending();
        fs.rmSync(path.dirname(tools), { recursive: true });
        await clock.tickAsync(200);
        expect(protection.getProtectedLocation(cache, tools)).to.be.undefined;
        fs.unlinkSync(guard);
        await clock.tickAsync(100);
        await ready;
        const location = protection.getProtectedLocation(cache, tools);
        const acquire = sinon.stub().resolves(undefined);

        await initializePqSdkTools({
            selectedToolsLocation: location,
            selectedToolsReady: Boolean(location && fs.existsSync(path.join(location, "PQTest.exe"))),
            packageService: {
                findNullableNewPqSdkVersion: sinon.stub().resolves("2.160.2"),
                updatePqSdkFromNuget: acquire,
                cleanupUnusedPackages: sinon.stub().resolves(),
            },
            onPackageAcquired: sinon.spy(),
            selectTools: sinon.stub().resolves(),
        });

        expect(acquire.calledOnceWithExactly("2.160.2")).to.be.true;
    });

    it("cancels retries and rejects waiting startup on disposal without notifying consumers", async () => {
        protection.getProtectedLocation(cache, tools);
        const recovered = sinon.spy();
        protection.subscribeOneEvent("recovered", recovered);
        const canceled = protection.waitForPending().then(
            () => {
                throw new Error("Disposed protection must not let startup continue");
            },
            (error: Error) => error,
        );

        protection.dispose();
        fs.unlinkSync(guard);
        await clock.tickAsync(1000);

        expect(await canceled).to.have.property("message", "SDK package protection has been disposed");
        expect(clock.countTimers()).to.equal(0);
        expect(recovered.called).to.be.false;
        expect(appendErrorLine.called).to.be.false;
    });

    it("reports unexpected retry errors and rejects startup instead of claiming readiness", async () => {
        protection.getProtectedLocation(cache, tools);
        const failed = protection.waitForPending().then(
            () => {
                throw new Error("Failed protection must not let startup continue");
            },
            (error: Error) => error,
        );
        sinon.stub(fs, "openSync").throws(new Error("access denied"));
        const recovered = sinon.spy();
        protection.subscribeOneEvent("recovered", recovered);
        await clock.tickAsync(100);

        expect(await failed).to.have.property("message", "access denied");
        expect(appendErrorLine.calledOnce).to.be.true;
        expect(appendErrorLine.firstCall.args[0]).to.contain("access denied");
        expect(recovered.called).to.be.false;
        expect(clock.countTimers()).to.equal(0);
    });
});

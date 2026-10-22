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
import { NugetPackageCleanupInProgressError } from "../../../src/utils/nugetPackageUsage";
import processIdentity = require("../../../src/utils/processIdentity");

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
        guard = path.join(
            usage,
            `cleanup-${process.pid}-${processIdentity.getProcessCreationTime(process.pid)}-00000000-0000-0000-0000-000000000000`,
        );
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

    it("defers exposure and refreshes directory and direct-executable consumers after recovery", async () => {
        const executable = path.join(tools, "PQTest.exe");
        const readDirectory = () => protection.getProtectedLocation(cache, tools);
        const readExecutable = () => protection.getProtectedExecutablePath(cache, executable);
        let exposedDirectory: string | undefined;
        let exposedExecutable: string | undefined;
        const refresh = sinon.spy(() => {
            exposedDirectory = readDirectory();
            exposedExecutable = readExecutable();
        });
        protection.subscribeOneEvent("recovered", refresh);

        expect(readDirectory()).to.be.undefined;
        expect(readExecutable).to.throw(NugetPackageCleanupInProgressError);
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

    it("reports a retryable error for a pending direct executable override rather than an unset path", async () => {
        const executable = path.join(tools, "PQTest.exe");

        expect(() => protection.getProtectedExecutablePath(cache, executable)).to.throw(
            NugetPackageCleanupInProgressError,
        );
        expect(appendInfoLine.calledOnce).to.be.true;

        fs.unlinkSync(guard);
        await clock.tickAsync(100);

        expect(protection.getProtectedExecutablePath(cache, executable)).to.equal(executable);
    });

    it("reclaims a persisted guard when its PID belongs to a different process instance", async () => {
        fs.unlinkSync(guard);
        const staleGuard = path.join(
            path.dirname(guard),
            `cleanup-${process.pid}-1-00000000-0000-0000-0000-000000000000`,
        );
        fs.writeFileSync(staleGuard, "");

        expect(protection.getProtectedLocation(cache, tools)).to.equal(tools);
        await protection.waitForPending();

        expect(fs.existsSync(staleGuard)).to.be.false;
        expect(clock.countTimers()).to.equal(0);
        expect(appendErrorLine.called).to.be.false;
    });

    it("resumes waiting startup when a cleanup owner's PID is reused between retries", async () => {
        fs.unlinkSync(guard);
        const otherPid = 2147483647;
        let creationTime = "123";
        const kill = process.kill;
        sinon.stub(process, "kill").callsFake((pid, signal) => (pid === otherPid ? true : kill(pid, signal)));
        const getCreationTime = processIdentity.getProcessCreationTime;
        sinon
            .stub(processIdentity, "getProcessCreationTime")
            .callsFake(pid => (pid === otherPid ? creationTime : getCreationTime(pid)));
        guard = path.join(path.dirname(guard), `cleanup-${otherPid}-123-00000000-0000-0000-0000-000000000000`);
        fs.writeFileSync(guard, "");
        expect(protection.getProtectedLocation(cache, tools)).to.be.undefined;
        const ready = protection.waitForPending();
        await clock.tickAsync(300);
        expect(fs.existsSync(guard)).to.be.true;
        expect(protection.getProtectedLocation(cache, tools)).to.be.undefined;

        creationTime = "456";
        await clock.tickAsync(100);
        await ready;

        expect(fs.existsSync(guard)).to.be.false;
        expect(protection.getProtectedLocation(cache, tools)).to.equal(tools);
        expect(clock.countTimers()).to.equal(0);
    });

    it("does not expire a live legacy guard whose process instance cannot be verified", () => {
        fs.unlinkSync(guard);
        const legacyGuard = path.join(
            path.dirname(guard),
            `cleanup-${process.pid}-00000000-0000-0000-0000-000000000000`,
        );
        fs.writeFileSync(legacyGuard, "");

        expect(() => protection.getProtectedLocation(cache, tools)).to.throw("without a process creation time");
        expect(fs.existsSync(legacyGuard)).to.be.true;
    });

    it("does not block a custom direct executable when an unrelated package is pending", () => {
        protection.getProtectedLocation(cache, tools);
        const customExecutable = path.join(root, "custom", "PQTest.exe");

        expect(protection.getProtectedExecutablePath(cache, customExecutable)).to.equal(customExecutable);
    });

    it("does not refresh a ready consumer when an unrelated package recovers", async () => {
        const activeTools = path.join(root, "active-tools");
        fs.mkdirSync(activeTools);
        const refresh = sinon.spy();
        protection.subscribeToLocationRecovery(
            () => ({ configuredLocation: activeTools, currentLocation: activeTools, ready: true }),
            refresh,
        );
        protection.getProtectedLocation(cache, tools);
        fs.unlinkSync(guard);
        await clock.tickAsync(100);

        expect(refresh.called).to.be.false;
    });

    it("refreshes only once when a pending consumer's effective location becomes available", async () => {
        let currentLocation = "";
        let ready = false;
        const refresh = sinon.spy(() => {
            currentLocation = tools;
            ready = true;
        });
        protection.subscribeToLocationRecovery(
            () => ({
                configuredLocation: protection.getProtectedLocation(cache, tools),
                currentLocation,
                ready,
            }),
            refresh,
        );
        protection.getProtectedLocation(cache, tools);
        protection.emit("recovered");
        expect(refresh.called).to.be.false;

        fs.unlinkSync(guard);
        await clock.tickAsync(100);
        protection.emit("recovered");

        expect(refresh.calledOnce).to.be.true;
    });

    it("does not refresh a ready consumer for an equivalent Windows path", () => {
        const refresh = sinon.spy();
        protection.subscribeToLocationRecovery(
            () => ({ configuredLocation: `${tools.toLowerCase()}${path.sep}.`, currentLocation: tools, ready: true }),
            refresh,
        );
        protection.emit("recovered");

        expect(refresh.called).to.be.false;
    });

    it("refreshes when the effective configured location changes", () => {
        const refresh = sinon.spy();
        protection.subscribeToLocationRecovery(
            () => ({ configuredLocation: tools, currentLocation: path.join(root, "previous"), ready: true }),
            refresh,
        );
        protection.emit("recovered");

        expect(refresh.calledOnce).to.be.true;
    });

    it("stops refreshing a disposed consumer", () => {
        const refresh = sinon.spy();
        const subscription = protection.subscribeToLocationRecovery(
            () => ({ configuredLocation: tools, currentLocation: "", ready: false }),
            refresh,
        );
        subscription.dispose();
        protection.emit("recovered");

        expect(refresh.called).to.be.false;
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

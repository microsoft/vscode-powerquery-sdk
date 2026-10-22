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

import packageJson from "../../../package.json";
import { ExtensionConstants } from "../../../src/constants/PowerQuerySdkExtension";
import { cleanupNugetPackages } from "../../../src/utils/nugetPackageRetention";
import { protectNugetPackage } from "../../../src/utils/nugetPackageUsage";
import processIdentity = require("../../../src/utils/processIdentity");

describe("SDK package retention", () => {
    let root: string;
    let cache: string;
    const prefix = `${ExtensionConstants.InternalMsftPqSdkToolsNugetName}.`;
    const setting = packageJson.contributes.configuration.properties["powerquery.sdk.externals.packagesToKeep"];

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "pq-retention-"));
        cache = path.join(root, ".nuget");
        fs.mkdirSync(cache);
    });

    afterEach(() => {
        sinon.restore();
        fs.rmSync(root, { recursive: true, force: true });
    });

    function addPackage(version: string): string {
        const tools = path.join(cache, `${prefix}${version}`, "tools");
        fs.mkdirSync(tools, { recursive: true });
        fs.writeFileSync(path.join(tools, "PQTest.exe"), "");

        return tools;
    }

    function versions(): string[] {
        return fs
            .readdirSync(cache)
            .filter(name => name !== ".sdk-package-usage")
            .sort();
    }

    it("keeps two packages by numeric version rather than name or modification time", async () => {
        const selected = addPackage("2.110.1");
        addPackage("2.99.9");
        addPackage("2.109.10");
        addPackage("2.109.2");

        expect(setting.default).to.equal(2);
        expect(setting.type).to.equal("integer");
        expect(setting.minimum).to.equal(1);
        expect(ExtensionConstants.ConfigNames.PowerQuerySdk.properties.externalsPackagesToKeep).to.equal(
            "externals.packagesToKeep",
        );

        await cleanupNugetPackages(cache, selected, setting.default);

        expect(versions()).to.deep.equal([`${prefix}2.109.10`, `${prefix}2.110.1`]);
    });

    it("counts a selected older version toward the limit", async () => {
        const selected = addPackage("2.100.1");
        addPackage("2.110.1");
        addPackage("2.109.1");

        await cleanupNugetPackages(cache, selected, 2);

        expect(versions()).to.deep.equal([`${prefix}2.100.1`, `${prefix}2.110.1`]);
    });

    it("supports retaining only the selected version", async () => {
        const selected = addPackage("2.100.1");
        addPackage("2.110.1");

        await cleanupNugetPackages(cache, selected, 1);

        expect(versions()).to.deep.equal([`${prefix}2.100.1`]);
    });

    it("protects a differently cased selected path with retention one", async () => {
        const selected = addPackage("2.100.1");
        addPackage("2.110.1");

        await cleanupNugetPackages(cache, selected.toLowerCase(), 1);

        expect(versions()).to.deep.equal([`${prefix}2.100.1`]);
        expect(fs.existsSync(path.join(selected, "PQTest.exe"))).to.be.true;
    });

    it("protects a selected path ending in tools\\.", async () => {
        const selected = addPackage("2.100.1");
        addPackage("2.110.1");

        await cleanupNugetPackages(cache, `${selected}${path.sep}.`, 1);

        expect(versions()).to.deep.equal([`${prefix}2.100.1`]);
        expect(fs.existsSync(path.join(selected, "PQTest.exe"))).to.be.true;
    });

    it("recognizes lowercase package directory names during cleanup", async () => {
        const selected = addPackage("2.100.1");
        const obsolete = addPackage("2.110.1");
        fs.renameSync(path.dirname(obsolete), path.dirname(obsolete).toLowerCase());

        await cleanupNugetPackages(cache, selected, 1);

        expect(versions()).to.deep.equal([`${prefix}2.100.1`]);
    });

    it("does not remove packages when the configured limit exceeds the cache size", async () => {
        const selected = addPackage("2.100.1");
        addPackage("2.110.1");

        await cleanupNugetPackages(cache, selected, 3);

        expect(versions()).to.have.length(2);
    });

    it("preserves unrelated files and unrecognized version directories", async () => {
        const selected = addPackage("2.110.1");
        addPackage("2.109.1");
        const preserved = ["Other.Package.1.0.0", `${prefix}2.108.1-preview`, `${prefix}2.107.1.backup`];
        for (const name of preserved) {
            fs.mkdirSync(path.join(cache, name));
        }
        fs.writeFileSync(path.join(cache, `${prefix}2.106.1`), "");

        await cleanupNugetPackages(cache, selected, 1);

        expect(versions()).to.deep.equal([...preserved, `${prefix}2.106.1`, `${prefix}2.110.1`].sort());
    });

    it("preserves linked package directories and their targets", async () => {
        const selected = addPackage("2.110.1");
        const target = path.join(root, "external");
        fs.mkdirSync(target);
        fs.writeFileSync(path.join(target, "keep.txt"), "keep");
        fs.symlinkSync(target, path.join(cache, `${prefix}2.100.1`), "junction");

        await cleanupNugetPackages(cache, selected, 1);

        expect(fs.existsSync(path.join(target, "keep.txt"))).to.be.true;
        expect(versions()).to.have.length(2);
    });

    it("does not clean a linked cache root", async () => {
        const selected = addPackage("2.110.1");
        addPackage("2.100.1");
        const linkedCache = path.join(root, "linked-cache");
        fs.symlinkSync(cache, linkedCache, "junction");

        await cleanupNugetPackages(linkedCache, selected, 1);

        expect(versions()).to.have.length(2);
    });

    it("does not clean when no managed executable has been selected", async () => {
        const selected = addPackage("2.110.1");
        addPackage("2.100.1");

        for (const location of [undefined, root, path.join(cache, `${prefix}2.99.1`, "tools")]) {
            await cleanupNugetPackages(cache, location, 1);
            expect(versions()).to.have.length(2);
        }

        fs.unlinkSync(path.join(selected, "PQTest.exe"));
        await cleanupNugetPackages(cache, selected, 1);
        expect(versions()).to.have.length(2);
    });

    it("handles a missing cache without creating it", async () => {
        const missing = path.join(root, "missing");
        await cleanupNugetPackages(missing, root, 2);
        expect(fs.existsSync(missing)).to.be.false;
    });

    it("reports invalid counts without deleting anything", async () => {
        const selected = addPackage("2.110.1");
        addPackage("2.100.1");
        const appendErrorLine = sinon.spy();

        for (const count of [0, -1, 1.5, NaN, Infinity]) {
            await cleanupNugetPackages(cache, selected, count, {
                appendErrorLine,
                appendInfoLine: sinon.spy(),
            });
        }

        expect(appendErrorLine.callCount).to.equal(5);
        expect(versions()).to.have.length(2);
    });

    it("logs deletion failures and continues cleaning other obsolete packages", async () => {
        const selected = addPackage("2.110.1");
        addPackage("2.109.1");
        addPackage("2.108.1");
        const remove = sinon.stub(fs, "rm");
        remove.onFirstCall().callsFake((_directory, _options, callback) => callback(new Error("locked")));
        remove.onSecondCall().callsFake((_directory, _options, callback) => callback(null));
        const appendErrorLine = sinon.spy();

        await cleanupNugetPackages(cache, selected, 1, {
            appendErrorLine,
            appendInfoLine: sinon.spy(),
        });

        expect(remove.callCount).to.equal(2);
        expect(appendErrorLine.calledOnce).to.be.true;
        expect(appendErrorLine.firstCall.args[0]).to.contain("locked");
        expect(fs.existsSync(path.join(selected, "PQTest.exe"))).to.be.true;
    });

    it("logs cache enumeration failures without failing the SDK selection", async () => {
        const selected = addPackage("2.110.1");
        const appendErrorLine = sinon.spy();
        sinon.stub(fs.promises, "readdir").rejects(new Error("access denied"));

        await cleanupNugetPackages(cache, selected, 2, {
            appendErrorLine,
            appendInfoLine: sinon.spy(),
        });

        expect(appendErrorLine.calledOnce).to.be.true;
        expect(appendErrorLine.firstCall.args[0]).to.contain("access denied");
        expect(fs.existsSync(path.join(selected, "PQTest.exe"))).to.be.true;
    });

    it("counts other active hosts' selections toward retention and keeps both when the limit is one", async () => {
        const selected = addPackage("2.160.2");
        const otherSelection = addPackage("2.158.1");
        addPackage("2.159.1");
        const otherPid = 2147483647;
        const kill = process.kill;
        sinon.stub(process, "kill").callsFake((pid, signal) => (pid === otherPid ? true : kill(pid, signal)));
        const getCreationTime = processIdentity.getProcessCreationTime;
        sinon.stub(processIdentity, "getProcessCreationTime").callsFake(pid => {
            return pid === otherPid ? "123" : getCreationTime(pid);
        });
        const usage = path.join(cache, ".sdk-package-usage", `${prefix}2.158.1`);
        fs.mkdirSync(usage, { recursive: true });
        fs.writeFileSync(path.join(usage, `use-${otherPid}-123-00000000-0000-0000-0000-000000000000`), "");

        await cleanupNugetPackages(cache, selected, 1);

        expect(versions()).to.deep.equal([`${prefix}2.158.1`, `${prefix}2.160.2`]);
        expect(fs.existsSync(path.join(otherSelection, "PQTest.exe"))).to.be.true;
    });

    it("reclaims a dead host's leases before applying retention", async () => {
        const selected = addPackage("2.160.2");
        addPackage("2.158.1");
        const deadPid = 2147483647;
        const kill = process.kill;
        sinon.stub(process, "kill").callsFake((pid, signal) => {
            if (pid === deadPid) {
                throw Object.assign(new Error("process exited"), { code: "ESRCH" });
            }

            return kill(pid, signal);
        });
        const usage = path.join(cache, ".sdk-package-usage", `${prefix}2.158.1`);
        fs.mkdirSync(usage, { recursive: true });
        fs.writeFileSync(path.join(usage, `use-${deadPid}-00000000-0000-0000-0000-000000000000`), "");
        fs.writeFileSync(path.join(usage, `cleanup-${deadPid}-00000000-0000-0000-0000-000000000000`), "");

        await cleanupNugetPackages(cache, selected, 1);

        expect(versions()).to.deep.equal([`${prefix}2.160.2`]);
        expect(fs.readdirSync(usage)).to.deep.equal([]);
    });

    it("fails closed if another host's liveness cannot be verified", async () => {
        const selected = addPackage("2.160.2");
        addPackage("2.158.1");
        const otherPid = 2147483647;
        const kill = process.kill;
        sinon.stub(process, "kill").callsFake((pid, signal) => {
            if (pid === otherPid) {
                throw Object.assign(new Error("access denied"), { code: "EPERM" });
            }

            return kill(pid, signal);
        });
        const usage = path.join(cache, ".sdk-package-usage", `${prefix}2.158.1`);
        fs.mkdirSync(usage, { recursive: true });
        fs.writeFileSync(path.join(usage, `use-${otherPid}-00000000-0000-0000-0000-000000000000`), "");
        const appendErrorLine = sinon.spy();

        await cleanupNugetPackages(cache, selected, 1, { appendErrorLine, appendInfoLine: sinon.spy() });

        expect(versions()).to.have.length(2);
        expect(appendErrorLine.calledOnce).to.be.true;
        expect(appendErrorLine.firstCall.args[0]).to.contain("access denied");
    });

    it("reclaims usage leases whose PID has been reused by another process instance", async () => {
        const selected = addPackage("2.160.2");
        const unused = addPackage("2.158.1");
        const usage = path.join(cache, ".sdk-package-usage", `${prefix}2.158.1`);
        fs.mkdirSync(usage, { recursive: true });
        fs.writeFileSync(path.join(usage, `use-${process.pid}-1-00000000-0000-0000-0000-000000000000`), "");

        await cleanupNugetPackages(cache, selected, 1);

        expect(fs.existsSync(unused)).to.be.false;
        expect(fs.readdirSync(usage)).to.deep.equal([]);
    });

    it("does not probe inaccessible usage owners when selecting their package", () => {
        const selected = addPackage("2.160.2");
        const otherPid = 2147483647;
        const kill = process.kill;
        const probe = sinon.stub(process, "kill").callsFake((pid, signal) => {
            if (pid === otherPid) {
                throw Object.assign(new Error("access denied"), { code: "EPERM" });
            }

            return kill(pid, signal);
        });
        const usage = path.join(cache, ".sdk-package-usage", `${prefix}2.160.2`);
        fs.mkdirSync(usage, { recursive: true });
        fs.writeFileSync(path.join(usage, `use-${otherPid}-00000000-0000-0000-0000-000000000000`), "");

        expect(() => protectNugetPackage(cache, selected)).not.to.throw();
        expect(probe.calledWith(otherPid)).to.be.false;
        expect(fs.existsSync(path.join(selected, "PQTest.exe"))).to.be.true;
    });

    it("keeps paths exposed earlier in this host available to existing queues and tasks", async () => {
        const previousSelection = addPackage("2.158.1");
        protectNugetPackage(cache, previousSelection);
        const selected = addPackage("2.160.2");

        await cleanupNugetPackages(cache, selected, 1);

        expect(versions()).to.have.length(2);
    });

    it("does not write usage markers for custom locations", () => {
        protectNugetPackage(cache, root);

        expect(fs.readdirSync(cache)).to.deep.equal([]);
    });

    it("rechecks usage when another selection wins the race after cleanup candidates were chosen", async () => {
        const selected = addPackage("2.160.2");
        const newlySelected = addPackage("2.158.1");
        const open = fs.openSync;
        let selectedDuringCleanup = false;
        sinon.stub(fs, "openSync").callsFake((file, flags, mode) => {
            if (
                !selectedDuringCleanup &&
                typeof file === "string" &&
                flags === "wx" &&
                path.basename(file).startsWith("cleanup-")
            ) {
                selectedDuringCleanup = true;
                protectNugetPackage(cache, newlySelected);
            }

            return open(file, flags, mode);
        });

        await cleanupNugetPackages(cache, selected, 1);

        expect(selectedDuringCleanup).to.be.true;
        expect(fs.existsSync(path.join(newlySelected, "PQTest.exe"))).to.be.true;
        expect(versions()).to.have.length(2);
    });
});

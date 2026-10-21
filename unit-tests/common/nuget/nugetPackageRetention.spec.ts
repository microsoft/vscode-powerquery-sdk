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
        return fs.readdirSync(cache).sort();
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
        for (const name of preserved) fs.mkdirSync(path.join(cache, name));
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
});

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { expect } from "chai";
import { ChildProcess, fork } from "child_process";
import fs = require("fs");
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";

import { ExtensionConstants } from "../../../src/constants/PowerQuerySdkExtension";
import { cleanupNugetPackages } from "../../../src/utils/nugetPackageRetention";
import { protectNugetPackage } from "../../../src/utils/nugetPackageUsage";

describe("SDK package coordination across processes", function () {
    this.timeout(20000);
    let root: string;
    let cache: string;
    let hosts: ChildProcess[];

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "pq-hosts-"));
        cache = path.join(root, ".nuget");
        fs.mkdirSync(cache);
        hosts = [];
    });

    async function stopHost(child: ChildProcess): Promise<void> {
        if (child.exitCode !== null) {
            return;
        }

        await new Promise<void>((resolve, reject) => {
            child.once("exit", code => (code === 0 ? resolve() : reject(new Error(`Host exited with ${code}`))));
            child.disconnect();
        });
    }

    afterEach(async () => {
        await Promise.all(hosts.map(stopHost));
        sinon.restore();
        fs.rmSync(root, { recursive: true, force: true });
    });

    function addPackage(version: string): string {
        const tools = path.join(cache, `${ExtensionConstants.InternalMsftPqSdkToolsNugetName}.${version}`, "tools");
        fs.mkdirSync(tools, { recursive: true });
        fs.writeFileSync(path.join(tools, "PQTest.exe"), "");

        return tools;
    }

    function startHost(tools: string): { readonly child: ChildProcess; readonly result: Promise<unknown> } {
        const child = fork(path.join(__dirname, "fixtures", "packageUsageHost.ts"), [cache, tools], {
            execArgv: ["-r", "ts-node/register"],
            silent: true,
        });
        hosts.push(child);
        const result = new Promise<unknown>((resolve, reject) => {
            child.once("message", resolve);
            child.once("error", reject);
            child.once("exit", code => reject(new Error(`Host exited before responding: ${code}`)));
        });

        return { child, result };
    }

    it("keeps another host's differently cased tools\\. selection until that host exits", async () => {
        const selected = addPackage("2.160.2");
        const otherSelection = addPackage("2.158.1");
        const unused = addPackage("2.159.1");
        const host = startHost(`${otherSelection.toLowerCase()}${path.sep}.`);
        expect(await host.result).to.deep.equal({ protected: true });

        await cleanupNugetPackages(cache, selected, 1);
        expect(fs.existsSync(path.join(otherSelection, "PQTest.exe"))).to.be.true;
        expect(fs.existsSync(unused)).to.be.false;

        await stopHost(host.child);
        await cleanupNugetPackages(cache, selected, 1);
        expect(fs.existsSync(otherSelection)).to.be.false;
    });

    it("does not expose tools while another process owns their deletion", async () => {
        const selected = addPackage("2.160.2");
        const obsolete = addPackage("2.158.1");
        const remove = fs.rm;
        let finishDeletion: () => void = () => {
            throw new Error("Deletion did not start");
        };
        let deletionStarted: () => void = () => {
            throw new Error("Deletion gate is not initialized");
        };
        const started = new Promise<void>(resolve => {
            deletionStarted = resolve;
        });
        sinon.stub(fs, "rm").callsFake((directory, options, callback) => {
            finishDeletion = () => remove(directory, options, callback);
            deletionStarted();
        });
        const cleaning = cleanupNugetPackages(cache, selected, 1);
        await started;

        try {
            const host = startHost(obsolete);
            const result = await host.result;
            expect(result).to.have.property("protected", false);
            expect(result).to.have.property("error").that.contains("cleanup is in progress");
            expect(fs.existsSync(path.join(obsolete, "PQTest.exe"))).to.be.true;

            fs.rmSync(path.dirname(obsolete), { recursive: true, force: true });
            expect(() => protectNugetPackage(cache, obsolete)).to.throw("cleanup is in progress");
        } finally {
            finishDeletion();
            await cleaning;
        }

        expect(fs.existsSync(obsolete)).to.be.false;
    });
});

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { expect } from "chai";
import { spawnSync, SpawnSyncReturns } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

describe("Isolated SDK test runner configuration", () => {
    const repository = path.resolve(__dirname, "..");
    let root: string;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "pq-runner-"));
        fs.writeFileSync(path.join(root, "PQTest.exe"), "");
        fs.writeFileSync(path.join(root, "MakePQX.exe"), "");
        fs.writeFileSync(path.join(root, "nuget.exe"), "");
    });

    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    function load(overrides: NodeJS.ProcessEnv = {}): SpawnSyncReturns<string> {
        const env = { ...process.env };

        for (const key of [
            "PQSDK_TEST_TOOLS_PATH",
            "PQSDK_TEST_TOOLS_AUTODISCOVER",
            "PQSDK_TEST_NUGET_PATH",
            "PQSDK_TEST_NUGET_FEED",
            "PQSDK_TEST_EXTERNAL",
        ]) {
            delete env[key];
        }

        return spawnSync(
            process.execPath,
            [
                "--input-type=module",
                "-e",
                "import config from './.vscode-test.mjs'; console.log(JSON.stringify(config));",
            ],
            { cwd: repository, env: { ...env, ...overrides }, encoding: "utf8" },
        );
    }

    it("forwards a validated local override without replacing command-line test filters", () => {
        const result = load({ PQSDK_TEST_TOOLS_PATH: root });
        expect(result.status, result.stderr).to.equal(0);
        const config = JSON.parse(result.stdout);
        expect(config.env.PQSDK_TEST_TOOLS_PATH).to.equal(root);
        expect(config.mocha).not.to.have.property("grep");
        expect(config.mocha).not.to.have.property("invert");
    });

    it("rejects invalid local paths before starting VS Code", () => {
        const result = load({ PQSDK_TEST_TOOLS_PATH: path.join(root, "missing") });
        expect(result.status).not.to.equal(0);
        expect(result.stderr).to.contain("PQSDK_TEST_TOOLS_PATH");
    });

    it("requires explicit feed configuration for real acquisition tests", () => {
        const result = load({ PQSDK_TEST_EXTERNAL: "1" });
        expect(result.status).not.to.equal(0);
        expect(result.stderr).to.contain("Set both PQSDK_TEST_NUGET_PATH and PQSDK_TEST_NUGET_FEED");
    });

    it("rejects simultaneous local reuse and real feed testing", () => {
        const result = load({ PQSDK_TEST_TOOLS_PATH: root, PQSDK_TEST_EXTERNAL: "1" });
        expect(result.status).not.to.equal(0);
        expect(result.stderr).to.contain("Unset PQSDK_TEST_TOOLS_PATH");
    });

    it("discovers a cached package before launch and forwards the resolved tools path", () => {
        const tools = path.join(root, "microsoft.powerquery.sdktools", "2.160.4", "tools");
        fs.mkdirSync(tools, { recursive: true });
        fs.writeFileSync(path.join(tools, "PQTest.exe"), "");
        fs.writeFileSync(path.join(tools, "MakePQX.exe"), "");
        const result = load({ PQSDK_TEST_TOOLS_AUTODISCOVER: "1", NUGET_PACKAGES: root });
        expect(result.status, result.stderr).to.equal(0);
        const config = JSON.parse(result.stdout);
        expect(config.env.PQSDK_TEST_TOOLS_PATH).to.equal(tools);
        expect(config.env.PQSDK_TEST_TOOLS_AUTODISCOVER).to.equal("1");
    });

    it("fails discovery before launching VS Code when the cache has no SDK Tools", () => {
        const result = load({ PQSDK_TEST_TOOLS_AUTODISCOVER: "1", NUGET_PACKAGES: root });
        expect(result.status).not.to.equal(0);
        expect(result.stderr).to.contain("No NuGet download will be attempted");
    });

    it("rejects autodiscovery combined with real acquisition testing", () => {
        const result = load({ PQSDK_TEST_TOOLS_AUTODISCOVER: "1", PQSDK_TEST_EXTERNAL: "1" });
        expect(result.status).not.to.equal(0);
        expect(result.stderr).to.contain("Unset PQSDK_TEST_TOOLS_PATH and PQSDK_TEST_TOOLS_AUTODISCOVER");
    });

    it("writes feed settings only into the ignored test workspace before activation", () => {
        const workspace = path.join(repository, ".vscode-test", "sdk-feed.code-workspace");
        const previous = fs.existsSync(workspace) ? fs.readFileSync(workspace) : undefined;

        try {
            const result = load({
                PQSDK_TEST_NUGET_PATH: root,
                PQSDK_TEST_NUGET_FEED: "https://example.invalid/nuget/v3/index.json",
                PQSDK_TEST_EXTERNAL: "1",
            });

            expect(result.status, result.stderr).to.equal(0);
            const config = JSON.parse(result.stdout);
            expect(config.workspaceFolder).to.equal(workspace);
            expect(config.mocha).not.to.have.property("invert");
            const content = JSON.parse(fs.readFileSync(workspace, "utf8"));

            expect(content.settings).to.deep.equal({
                "powerquery.sdk.externals.nugetPath": root,
                "powerquery.sdk.externals.nugetFeed": "https://example.invalid/nuget/v3/index.json",
            });
        } finally {
            if (previous) {
                fs.writeFileSync(workspace, previous);
            } else if (fs.existsSync(workspace)) {
                fs.unlinkSync(workspace);
            }
        }
    });
});

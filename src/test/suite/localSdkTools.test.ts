/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

/* global setup, teardown */

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";
import * as vscode from "vscode";

import { NugetCommandService } from "../../common/nuget/NugetCommandService";
import { NugetHttpService } from "../../common/nuget/NugetHttpService";
import { PqSdkNugetPackageService } from "../../common/PqSdkNugetPackageService";
import { ExtensionConfigurations } from "../../constants/PowerQuerySdkConfiguration";
import { initializeLocalSdkTools } from "../../utils/localSdkTools";
import { nugetPackageProtection } from "../../utils/NugetPackageProtection";
import { resolvePqTestExecutablePath } from "../../utils/pqTestPath";

suite("Local SDK Tools development override", () => {
    let root: string;
    let sandbox: sinon.SinonSandbox;
    let subscriptions: vscode.Disposable[];

    setup(() => {
        sandbox = sinon.createSandbox();
        subscriptions = [];
        root = fs.mkdtempSync(path.join(os.tmpdir(), "pq-local-host-"));
        fs.writeFileSync(path.join(root, "PQTest.exe"), "");
        fs.writeFileSync(path.join(root, "MakePQX.exe"), "");
        initializeLocalSdkTools(true, { PQSDK_TEST_TOOLS_PATH: root });
        sandbox.stub(vscode.workspace, "getConfiguration").throws(new Error("Must not read or write saved settings"));
        sandbox.stub(NugetHttpService.prototype, "getSortedPackageReleasedVersions").throws(new Error("No HTTP"));
        sandbox.stub(NugetHttpService.prototype, "downloadAndExtractNugetPackage").throws(new Error("No HTTP"));
        sandbox.stub(NugetCommandService.prototype, "getSortedPackageReleasedVersions").throws(new Error("No CLI"));
        sandbox.stub(NugetCommandService.prototype, "downloadAndExtractNugetPackage").throws(new Error("No CLI"));
    });

    teardown(() => {
        subscriptions
            .filter(disposable => disposable !== nugetPackageProtection)
            .forEach(disposable => disposable.dispose());

        sandbox.restore();
        initializeLocalSdkTools(false);
        fs.rmSync(root, { recursive: true, force: true });
    });

    test("resolves the same local tools through all configuration surfaces without saving settings", async () => {
        const executable = path.join(root, "PQTest.exe");
        assert.strictEqual(ExtensionConfigurations.PQTestLocation, root);
        assert.strictEqual(await ExtensionConfigurations.getPQTestLocation(), root);
        assert.strictEqual(ExtensionConfigurations.pqTestExecutablePath, executable);
        assert.strictEqual(await ExtensionConfigurations.getPqTestExecutablePath(), executable);
        assert.strictEqual(await resolvePqTestExecutablePath(), executable);
    });

    test("bypasses version discovery, acquisition, protection, and pruning", async () => {
        const service = new PqSdkNugetPackageService({
            extensionPath: root,
            subscriptions,
        } as vscode.ExtensionContext);

        assert.strictEqual(await service.findNullableNewPqSdkVersion(), undefined);
        assert.strictEqual(await service.updatePqSdkFromNuget("1.2.3"), path.join(root, "PQTest.exe"));
        await service.waitForConfiguredPackages();
        await service.cleanupUnusedPackages();
        assert.ok(!fs.existsSync(path.join(root, ".nuget")));
        assert.ok(fs.existsSync(path.join(root, "PQTest.exe")));
    });

    test("preserves cancellation when resolving the local tools", async () => {
        const cancellation = new vscode.CancellationTokenSource();
        cancellation.cancel();

        try {
            await assert.rejects(ExtensionConfigurations.getPQTestLocation(cancellation.token));
            await assert.rejects(ExtensionConfigurations.getPqTestExecutablePath(cancellation.token));
        } finally {
            cancellation.dispose();
        }
    });
});

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

/* global setup, teardown */

import * as assert from "assert";
import cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";
import { setImmediate } from "timers";
import * as vscode from "vscode";

import { NugetHttpService } from "../../common/nuget/NugetHttpService";
import { PqSdkNugetPackageService } from "../../common/PqSdkNugetPackageService";
import { ExtensionConfigurations } from "../../constants/PowerQuerySdkConfiguration";
import { MQueryDebugSession } from "../../debugAdaptor/MQueryDebugSession";
import { PowerQueryTaskProvider } from "../../features/PowerQueryTaskProvider";
import { PqSdkOutputChannel } from "../../features/PqSdkOutputChannel";
import { DISCONNECTED, PqServiceHostClientLite, READY } from "../../pqTestConnector/PqServiceHostClientLite";
import { PqTestExecutableOnceTask } from "../../pqTestConnector/PqTestExecutableOnceTask";
import { PqTestExecutableTaskQueue } from "../../pqTestConnector/PqTestExecutableTaskQueue";
import { PqTestDiscoveryRunner } from "../../testing/pqtest-adapter/helpers/PqTestDiscoveryRunner";
import { registerTestController } from "../../testing/pqtest-adapter/TestController";
import { TestDiscoveryService } from "../../testing/pqtest-adapter/TestDiscoveryService";
import { TestRunCoordinator } from "../../testing/pqtest-adapter/TestRunCoordinator";
import { TestWatcherManager } from "../../testing/pqtest-adapter/TestWatcherManager";
import * as cleanupUtils from "../../testing/pqtest-adapter/utils/cleanupUtils";
import * as testSettingsUtils from "../../testing/pqtest-adapter/utils/testSettingsUtils";
import { NugetPackageProtection, nugetPackageProtection } from "../../utils/NugetPackageProtection";
import { resolvePqTestExecutablePath } from "../../utils/pqTestPath";
import * as processIdentity from "../../utils/processIdentity";

class TestDebugSession extends MQueryDebugSession {
    public launch(): Promise<void> {
        return this.launchRequest(
            { type: "response", seq: 1, request_seq: 1, success: true, command: "launch" },
            { program: "query.pq" },
        );
    }

    public finishConfiguration(): void {
        this.configurationDoneRequest(
            { type: "response", seq: 2, request_seq: 2, success: true, command: "configurationDone" },
            {},
        );
    }
}

suite("SDK package readiness consumers", () => {
    let sandbox: sinon.SinonSandbox;
    let root: string;
    let cache: string;
    let tools: string;
    let protection: NugetPackageProtection;
    let finishIdentity: (identity: string) => void;
    let rejectIdentity: (error: Error) => void;
    let getTools: sinon.SinonStub;
    let getExecutable: sinon.SinonStub;
    let output: sinon.SinonStubbedInstance<PqSdkOutputChannel>;
    let cancellation: vscode.CancellationTokenSource;
    let disposables: vscode.Disposable[];

    setup(() => {
        sandbox = sinon.createSandbox();
        root = fs.mkdtempSync(path.join(os.tmpdir(), "pq-readiness-"));
        cache = path.join(root, ".nuget");
        tools = path.join(cache, "Microsoft.PowerQuery.SdkTools.2.160.2", "tools");
        fs.mkdirSync(tools, { recursive: true });
        fs.writeFileSync(path.join(tools, "PQTest.exe"), "");

        const identity: Promise<string> = new Promise(
            (resolve: (value: string) => void, reject: (error: Error) => void) => {
                finishIdentity = resolve;
                rejectIdentity = reject;
            },
        );

        sandbox.stub(processIdentity, "getProcessCreationTime").returns(identity);
        protection = new NugetPackageProtection();
        output = sandbox.createStubInstance(PqSdkOutputChannel);
        protection.setOutputChannel(output);
        getExecutable = sandbox.stub(ExtensionConfigurations, "getPqTestExecutablePath").resolves(undefined);

        getTools = sandbox
            .stub(ExtensionConfigurations, "getPQTestLocation")
            .callsFake((token?: vscode.CancellationToken) => protection.getProtectedLocationAsync(cache, tools, token));

        cancellation = new vscode.CancellationTokenSource();
        disposables = [cancellation, protection];
    });

    teardown(() => {
        cancellation.cancel();
        disposables.reverse().forEach((disposable: vscode.Disposable) => disposable.dispose());
        sandbox.restore();
        fs.rmSync(root, { recursive: true, force: true });
    });

    async function assertWaiting(pending: Promise<unknown>): Promise<void> {
        let settled: boolean = false;

        void pending.then(
            () => {
                settled = true;
            },
            () => {
                settled = true;
            },
        );

        await new Promise<void>((resolve: () => void) => setImmediate(resolve));
        assert.strictEqual(settled, false, "The request must wait for identity verification");
    }

    function stubSpawn(): sinon.SinonStub {
        return sandbox.stub(cp, "spawn").callsFake(() => {
            const child: cp.ChildProcess = new cp.ChildProcess();
            process.nextTick(() => child.emit("exit", 0, null));

            return child;
        });
    }

    function createPackageService(): PqSdkNugetPackageService {
        sandbox.stub(ExtensionConfigurations, "PQTestLocation").get(() => undefined);
        sandbox.stub(ExtensionConfigurations, "pqTestExecutablePath").get(() => undefined);
        sandbox.stub(ExtensionConfigurations, "nugetPath").get(() => undefined);

        sandbox
            .stub(nugetPackageProtection, "getProtectedLocationAsync")
            .callsFake((base: string, location: string) => protection.getProtectedLocationAsync(base, location));

        sandbox.stub(nugetPackageProtection, "waitForPending").rejects(new Error("Unexpected global wait"));

        const subscriptions: vscode.Disposable[] = [];

        const service: PqSdkNugetPackageService = new PqSdkNugetPackageService({
            extensionPath: root,
            subscriptions,
        } as vscode.ExtensionContext);

        disposables.push(...subscriptions.filter((entry: vscode.Disposable) => entry !== nugetPackageProtection));

        return service;
    }

    test("package acquisition does not wait for an unrelated package's cleanup guard", async () => {
        const otherTools: string = path.join(cache, "Microsoft.PowerQuery.SdkTools.2.159.1", "tools");
        const usage: string = path.join(cache, ".sdk-package-usage", path.basename(path.dirname(otherTools)));
        fs.mkdirSync(usage, { recursive: true });

        fs.writeFileSync(path.join(usage, `cleanup-${process.pid}-123-00000000-0000-0000-0000-000000000000`), "");

        protection.getProtectedLocation(cache, otherTools);
        fs.unlinkSync(path.join(tools, "PQTest.exe"));

        const download: sinon.SinonStub = sandbox
            .stub(NugetHttpService.prototype, "downloadAndExtractNugetPackage")
            .callsFake((): Promise<void> => {
                fs.writeFileSync(path.join(tools, "PQTest.exe"), "");

                return Promise.resolve();
            });

        const pending: Promise<string | undefined> = createPackageService().updatePqSdkFromNuget("2.160.2");
        await assertWaiting(pending);
        sinon.assert.notCalled(download);
        finishIdentity("123");

        assert.strictEqual(await pending, path.join(tools, "PQTest.exe"));
        sinon.assert.calledOnce(download);
        assert.strictEqual(protection.getProtectedLocation(cache, otherTools), undefined);
    });

    test("package acquisition propagates its own verification failure without downloading", async () => {
        const download: sinon.SinonStub = sandbox
            .stub(NugetHttpService.prototype, "downloadAndExtractNugetPackage")
            .resolves();

        const pending: Promise<string | undefined> = createPackageService().updatePqSdkFromNuget("2.160.2");
        await assertWaiting(pending);
        rejectIdentity(new Error("identity unavailable"));

        await assert.rejects(pending, /identity unavailable/);
        sinon.assert.notCalled(download);
    });

    test("executable debugging waits and launches exactly once", async () => {
        const spawn: sinon.SinonStub = stubSpawn();
        const task: PqTestExecutableOnceTask = new PqTestExecutableOnceTask();
        disposables.push(task);
        const pending: Promise<unknown> = task.run(path.join(root, "query.pq"), { operation: "list-template" });
        await assertWaiting(pending);
        sinon.assert.notCalled(spawn);

        finishIdentity("123");
        await pending;

        sinon.assert.calledOnce(spawn);
        assert.strictEqual(spawn.firstCall.args[0], path.join(tools, "PQTest.exe"));
    });

    test("disposing a pending executable task prevents its eventual launch", async () => {
        const spawn: sinon.SinonStub = stubSpawn();
        const task: PqTestExecutableOnceTask = new PqTestExecutableOnceTask();
        const pending: Promise<unknown> = task.run(path.join(root, "query.pq"), { operation: "list-template" });
        await assertWaiting(pending);
        task.dispose();
        await pending;
        finishIdentity("123");
        await protection.waitForPending();

        sinon.assert.notCalled(spawn);
    });

    function createServiceHostDebugSession(): {
        session: TestDebugSession;
        connect: sinon.SinonStub;
        run: sinon.SinonStub;
    } {
        sandbox.stub(ExtensionConfigurations, "featureUseServiceHost").get(() => true);

        sandbox
            .stub(ExtensionConfigurations, "PQTestLocation")
            .get(() => protection.getProtectedLocation(cache, tools));

        sandbox
            .stub(nugetPackageProtection, "subscribeToLocationRecovery")
            .callsFake((getState, recover) => protection.subscribeToLocationRecovery(getState, recover));

        const connect: sinon.SinonStub = sandbox.stub(
            PqServiceHostClientLite.prototype,
            "onPowerQueryTestLocationChanged",
        );

        const run: sinon.SinonStub = sandbox
            .stub(PqServiceHostClientLite.prototype, "RunTestBatteryFromContent")
            .resolves({});

        const session: TestDebugSession = new TestDebugSession();
        session.setRunAsServer(true);
        sandbox.stub(session, "sendResponse");
        sandbox.stub(session, "sendEvent");
        disposables.push({ dispose: () => session.shutdown() });

        return { session, connect, run };
    }

    test("service-host debug shutdown unsubscribes recovery and cancels pending readiness", async () => {
        const { session, connect, run }: ReturnType<typeof createServiceHostDebugSession> =
            createServiceHostDebugSession();

        protection.getProtectedLocation(cache, tools);
        const launching: Promise<void> = session.launch();
        session.finishConfiguration();
        await launching;

        sinon.assert.calledOnce(connect);
        const client: PqServiceHostClientLite = connect.firstCall.thisValue;
        assert.strictEqual(client.listenerCount(READY), 1);

        session.shutdown();
        finishIdentity("123");
        await protection.waitForPending();
        await new Promise<void>((resolve: () => void) => setImmediate(resolve));

        sinon.assert.calledOnce(connect);
        assert.strictEqual(client.listenerCount(READY), 0);
        assert.strictEqual(client.listenerCount(DISCONNECTED), 0);
        client.emit(READY);
        await new Promise<void>((resolve: () => void) => setImmediate(resolve));
        sinon.assert.notCalled(run);
    });

    test("service-host debug shutdown wins over an already signaled connection", async () => {
        const { session, connect, run }: ReturnType<typeof createServiceHostDebugSession> =
            createServiceHostDebugSession();

        const launching: Promise<void> = session.launch();
        session.finishConfiguration();
        await launching;
        const client: PqServiceHostClientLite = connect.firstCall.thisValue;
        client.emit(READY);
        session.shutdown();
        await new Promise<void>((resolve: () => void) => setImmediate(resolve));

        sinon.assert.notCalled(run);
    });

    test("service-host debug shutdown before configuration prevents connection", async () => {
        const { session, connect, run }: ReturnType<typeof createServiceHostDebugSession> =
            createServiceHostDebugSession();

        const launching: Promise<void> = session.launch();
        session.shutdown();
        await launching;

        sinon.assert.notCalled(connect);
        sinon.assert.notCalled(run);
    });

    test("service-host debugging executes once when readiness completes without shutdown", async () => {
        const { session, connect, run }: ReturnType<typeof createServiceHostDebugSession> =
            createServiceHostDebugSession();

        const launching: Promise<void> = session.launch();
        session.finishConfiguration();
        await launching;
        const client: PqServiceHostClientLite = connect.firstCall.thisValue;
        client.emit(READY);
        await new Promise<void>((resolve: () => void) => setImmediate(resolve));

        sinon.assert.calledOnce(run);
        assert.strictEqual(run.firstCall.args[0], path.resolve("query.pq"));
    });

    test("a pending direct override never falls back to the tools directory", async () => {
        const overrideTools: string = path.join(cache, "Microsoft.PowerQuery.SdkTools.2.159.1", "tools");
        const executable: string = path.join(overrideTools, "PQTest.exe");
        fs.mkdirSync(overrideTools, { recursive: true });
        fs.writeFileSync(executable, "");

        getExecutable.callsFake(async (token?: vscode.CancellationToken): Promise<string> => {
            await protection.getProtectedLocationAsync(cache, overrideTools, token);

            return executable;
        });

        const pending: Promise<string> = resolvePqTestExecutablePath(cancellation.token);
        await assertWaiting(pending);
        sinon.assert.notCalled(getTools);
        finishIdentity("123");

        assert.strictEqual(await pending, executable);
        sinon.assert.notCalled(getTools);
    });

    test("a failed direct override propagates failure without fallback", async () => {
        getExecutable.callsFake(async (token?: vscode.CancellationToken): Promise<string> => {
            await protection.getProtectedLocationAsync(cache, tools, token);

            return path.join(tools, "PQTest.exe");
        });

        const pending: Promise<string> = resolvePqTestExecutablePath(cancellation.token);
        await assertWaiting(pending);
        rejectIdentity(new Error("identity unavailable"));

        await assert.rejects(pending, /identity unavailable/);
        sinon.assert.notCalled(getTools);
    });

    function useRealConfiguration(directExecutable?: string): void {
        getTools.restore();
        getExecutable.restore();

        const extension: vscode.Extension<unknown> | undefined = vscode.extensions.getExtension(
            "PowerQuery.vscode-powerquery-sdk",
        );

        assert.ok(extension);
        sandbox.stub(vscode.extensions, "getExtension").returns({ ...extension, extensionPath: root });
        const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("powerquery.sdk");
        const get: sinon.SinonStub = sandbox.stub();
        get.withArgs("tools.location").returns(tools);
        get.withArgs("test.pqtest").returns(directExecutable);
        sandbox.stub(vscode.workspace, "getConfiguration").returns({ ...config, get });

        sandbox
            .stub(nugetPackageProtection, "getProtectedLocationAsync")
            .callsFake((base: string, location: string, token?: vscode.CancellationToken) => {
                assert.strictEqual(base, cache);

                return protection.getProtectedLocationAsync(base, location, token);
            });
    }

    test("the real configuration accessors await directory protection", async () => {
        useRealConfiguration();
        const pending: Promise<string> = resolvePqTestExecutablePath(cancellation.token);
        await assertWaiting(pending);
        finishIdentity("123");

        assert.strictEqual(await pending, path.join(tools, "PQTest.exe"));
    });

    test("the real configuration accessors preserve a direct override", async () => {
        const overrideTools: string = path.join(cache, "Microsoft.PowerQuery.SdkTools.2.159.1", "tools");
        const executable: string = path.join(overrideTools, "PQTest.exe");
        fs.mkdirSync(overrideTools, { recursive: true });
        fs.writeFileSync(executable, "");
        useRealConfiguration(executable);
        const pending: Promise<string> = resolvePqTestExecutablePath(cancellation.token);
        await assertWaiting(pending);
        finishIdentity("123");

        assert.strictEqual(await pending, executable);
    });

    function discover(): Promise<unknown> {
        sandbox.stub(testSettingsUtils, "determineExtensionsForTests").resolves(undefined);
        sandbox.stub(testSettingsUtils, "getTestPathFromSettings").resolves(root);

        return new TestDiscoveryService(output).discoverTests(
            vscode.Uri.file(path.join(root, "test.testsettings.json")),
            cancellation.token,
        );
    }

    test("test discovery waits and executes exactly once", async () => {
        const run: sinon.SinonStub = sandbox.stub(PqTestDiscoveryRunner.prototype, "runDiscovery").resolves([]);
        const pending: Promise<unknown> = discover();
        await assertWaiting(pending);
        sinon.assert.notCalled(run);
        finishIdentity("123");
        await pending;

        sinon.assert.calledOnce(run);
    });

    test("canceling discovery while verification is pending prevents execution", async () => {
        const run: sinon.SinonStub = sandbox.stub(PqTestDiscoveryRunner.prototype, "runDiscovery").resolves([]);
        const pending: Promise<unknown> = discover();
        await assertWaiting(pending);
        cancellation.cancel();
        await assert.rejects(pending);
        finishIdentity("123");
        await protection.waitForPending();

        sinon.assert.notCalled(run);
    });

    function createProvider(): PowerQueryTaskProvider {
        const service: sinon.SinonStubbedInstance<PqTestExecutableTaskQueue> =
            sandbox.createStubInstance(PqTestExecutableTaskQueue);

        service.pqTestReady = false;
        service.pqTestLocation = "";
        service.pqTestFullPath = "";

        protection.subscribeOneEvent("recovered", () => {
            service.pqTestReady = true;
            service.pqTestLocation = tools;
            service.pqTestFullPath = path.join(tools, "PQTest.exe");
        });

        return new PowerQueryTaskProvider(service);
    }

    test("task discovery waits for the backend to recover", async () => {
        const pending: Promise<vscode.Task[]> = createProvider().provideTasks(cancellation.token);
        await assertWaiting(pending);
        finishIdentity("123");
        const tasks: vscode.Task[] = await pending;

        assert.ok(tasks.some((task: vscode.Task) => task.definition.operation === "compile"));
    });

    function compileTask(): vscode.Task {
        return new vscode.Task(
            { type: "powerquery", operation: "compile" },
            vscode.TaskScope.Workspace,
            "Compile readiness fixture",
            "readiness",
        );
    }

    test("compile-task resolution waits and returns the protected MakePQX path", async () => {
        const pending: Promise<vscode.Task | undefined> = createProvider().resolveTask(
            compileTask(),
            cancellation.token,
        );

        await assertWaiting(pending);
        finishIdentity("123");
        const task: vscode.Task | undefined = await pending;

        assert.ok(task?.execution instanceof vscode.ProcessExecution);
        assert.strictEqual(task.execution.process, path.join(tools, "MakePQX.exe"));
    });

    test("canceling task resolution does not create a task after recovery", async () => {
        const pending: Promise<vscode.Task | undefined> = createProvider().resolveTask(
            compileTask(),
            cancellation.token,
        );

        await assertWaiting(pending);
        cancellation.cancel();

        assert.strictEqual(await pending, undefined);
        finishIdentity("123");
        await protection.waitForPending();
    });

    test("task resolution propagates verification failures", async () => {
        const pending: Promise<vscode.Task | undefined> = createProvider().resolveTask(
            compileTask(),
            cancellation.token,
        );

        await assertWaiting(pending);
        rejectIdentity(new Error("identity unavailable"));

        await assert.rejects(pending, /identity unavailable/);
    });

    function startTestRun(): Promise<void> {
        const controller: vscode.TestController = vscode.tests.createTestController("sdk-readiness", "SDK readiness");
        sandbox.stub(vscode.tests, "createTestController").returns(controller);
        const profile: sinon.SinonSpy = sandbox.spy(controller, "createRunProfile");
        sandbox.stub(TestWatcherManager.prototype, "initialize").resolves();
        sandbox.stub(cleanupUtils, "initializeCleanupTimer");
        sandbox.stub(cleanupUtils, "cleanupOldIntermediateResults").resolves();
        sandbox.stub(cleanupUtils, "maybeCleanupIntermediateResults");
        registerTestController({ subscriptions: disposables } as vscode.ExtensionContext, output);
        const handler: vscode.TestRunProfile["runHandler"] = profile.firstCall.args[2];

        return Promise.resolve(handler(new vscode.TestRunRequest(), cancellation.token));
    }

    test("Test Explorer waits before starting its run coordinator", async () => {
        const run: sinon.SinonStub = sandbox.stub(TestRunCoordinator.prototype, "run").resolves();
        const pending: Promise<void> = startTestRun();
        await assertWaiting(pending);
        sinon.assert.notCalled(run);
        finishIdentity("123");
        await pending;

        sinon.assert.calledOnce(run);
    });

    test("a canceled Test Explorer run never starts the coordinator", async () => {
        const run: sinon.SinonStub = sandbox.stub(TestRunCoordinator.prototype, "run").resolves();
        const pending: Promise<void> = startTestRun();
        await assertWaiting(pending);
        cancellation.cancel();
        await pending;
        finishIdentity("123");
        await protection.waitForPending();

        sinon.assert.notCalled(run);
    });

    test("Test Explorer reports verification failure without starting its coordinator", async () => {
        const run: sinon.SinonStub = sandbox.stub(TestRunCoordinator.prototype, "run").resolves();
        const showError: sinon.SinonStub = sandbox.stub(vscode.window, "showErrorMessage").resolves(undefined);
        const pending: Promise<void> = startTestRun();
        await assertWaiting(pending);
        rejectIdentity(new Error("identity unavailable"));
        await pending;

        sinon.assert.notCalled(run);
        sinon.assert.calledOnce(showError);
        assert.ok(showError.firstCall.args[0].includes("identity unavailable"));
    });
});

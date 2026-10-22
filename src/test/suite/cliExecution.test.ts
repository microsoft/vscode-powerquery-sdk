/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

/* global setup, teardown */

import * as assert from "assert";
import childProcess from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";
import * as vscode from "vscode";

import { PowerQueryTaskDefinition } from "../../common/PowerQueryTask";
import { IPQTestService } from "../../common/PQTestService";
import { ExtensionConfigurations } from "../../constants/PowerQuerySdkConfiguration";
import { PowerQueryTaskProvider } from "../../features/PowerQueryTaskProvider";
import { PqSdkOutputChannel } from "../../features/PqSdkOutputChannel";
import { PqTestTaskTerminal } from "../../features/PqTestTaskTerminal";
import { GlobalEventBus } from "../../GlobalEventBus";
import { extensionI18n } from "../../i18n/extension";
import {
    PqTestExecutableOnceTask,
    PqTestExecutableOnceTaskQueueEvents,
} from "../../pqTestConnector/PqTestExecutableOnceTask";
import { PqTestExecutableTaskQueue } from "../../pqTestConnector/PqTestExecutableTaskQueue";
import { inferAnyGeneralErrorString } from "../../pqTestConnector/PqTestTaskUtils";
import * as taskUtils from "../../pqTestConnector/PqTestTaskUtils";
import { ensureQueryDocumentSaved } from "../../utils/queryDocuments";

suite("CLI-only execution", () => {
    let sandbox: sinon.SinonSandbox;
    let directory: string;
    let executable: string;

    setup(() => {
        sandbox = sinon.createSandbox();
        directory = fs.mkdtempSync(path.join(os.tmpdir(), "pq-sdk-cli-"));
        executable = path.join(directory, "PQTest.exe");
        fs.writeFileSync(executable, "");
        sandbox.stub(ExtensionConfigurations, "PQTestLocation").get(() => directory);
        sandbox.stub(ExtensionConfigurations, "pqTestExecutablePath").get(() => undefined);
        sandbox.stub(ExtensionConfigurations, "msbuildPath").get(() => undefined);
        sandbox.stub(taskUtils, "executeBuildTaskAndAwaitIfNeeded").resolves();
    });

    teardown(() => {
        sandbox.restore();
        fs.rmSync(directory, { recursive: true, force: true });
    });

    function mockDocument(options: Partial<vscode.TextDocument> = {}): vscode.TextDocument {
        const document: vscode.TextDocument = {
            uri: vscode.Uri.file(path.join(directory, "hidden.query.pq")),
            isDirty: true,
            isUntitled: false,
            save: sandbox.stub().resolves(false),
            ...options,
        } as vscode.TextDocument;

        sandbox.stub(vscode.workspace, "textDocuments").get(() => [document]);

        return document;
    }

    function chooseSave(): void {
        const prompt: sinon.SinonStub = sandbox.stub(vscode.window, "showWarningMessage");
        prompt.resolves(extensionI18n["PQSdk.query.saveAndRun"]);
    }

    function stubCli(output: unknown, exitCode: number = 0): sinon.SinonStub {
        const originalSpawn = childProcess.spawn.bind(childProcess);

        return sandbox
            .stub(childProcess, "spawn")
            .callThrough()
            .withArgs(executable)
            .callsFake(() =>
                originalSpawn(
                    process.execPath,
                    [
                        "-e",
                        `process.stdout.write(${JSON.stringify(JSON.stringify(output))}); process.exitCode = ${exitCode};`,
                    ],
                    { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } },
                ),
            );
    }

    test("clean files do not prompt or save", async () => {
        const document = mockDocument({ isDirty: false });
        const prompt = sandbox.stub(vscode.window, "showWarningMessage");

        await ensureQueryDocumentSaved(document.uri.fsPath);
        assert.ok(prompt.notCalled);
        assert.ok((document.save as sinon.SinonStub).notCalled);
    });

    test("Save and Run saves the target even when its editor is not visible", async () => {
        const save = sandbox.stub().callsFake(() => {
            sandbox.stub(document, "isDirty").get(() => false);

            return Promise.resolve(true);
        });

        const document = mockDocument({ save });
        chooseSave();

        await ensureQueryDocumentSaved(document.uri.fsPath);
        assert.ok(save.calledOnce);
    });

    test("dismissal cancels without saving", async () => {
        const document = mockDocument();
        sandbox.stub(vscode.window, "showWarningMessage").resolves(undefined);

        await assert.rejects(ensureQueryDocumentSaved(document.uri.fsPath), /cancelled/i);
        assert.ok((document.save as sinon.SinonStub).notCalled);
    });

    test("failed saves and documents still dirty after saving cancel execution", async () => {
        const document = mockDocument();
        chooseSave();

        await assert.rejects(ensureQueryDocumentSaved(document.uri.fsPath), /could not be saved/);
        (document.save as sinon.SinonStub).resolves(true);
        await assert.rejects(ensureQueryDocumentSaved(document.uri.fsPath), /could not be saved/);
    });

    test("save exceptions remain failures", async () => {
        const document = mockDocument({ save: sandbox.stub().rejects(new Error("Write failed")) });
        chooseSave();

        await assert.rejects(ensureQueryDocumentSaved(document.uri.fsPath), /Write failed/);
    });

    test("untitled queries must first be saved to a file", async () => {
        const document = mockDocument({ uri: vscode.Uri.parse("untitled:Untitled-1"), isUntitled: true });

        await assert.rejects(ensureQueryDocumentSaved(document.uri.fsPath), /local file/);
        assert.ok((document.save as sinon.SinonStub).notCalled);
    });

    test("saving another document is never required", async () => {
        const document = mockDocument();
        const prompt = sandbox.stub(vscode.window, "showWarningMessage");

        await ensureQueryDocumentSaved(path.join(directory, "other.query.pq"));
        assert.ok(prompt.notCalled);
        assert.ok((document.save as sinon.SinonStub).notCalled);
    });

    for (const legacyValue of [undefined, false, true]) {
        test(`provided and saved tasks use CLI execution with legacy setting ${legacyValue}`, async () => {
            const originalGetConfiguration = vscode.workspace.getConfiguration.bind(vscode.workspace);

            sandbox.stub(vscode.workspace, "getConfiguration").callsFake((section, scope) => {
                const configuration = originalGetConfiguration(section, scope);
                const originalGet = configuration.get.bind(configuration);

                configuration.get = ((key: string, defaultValue?: unknown): unknown =>
                    key === "features.useServiceHost"
                        ? legacyValue
                        : originalGet(key, defaultValue)) as typeof configuration.get;

                return configuration;
            });

            const provider = new PowerQueryTaskProvider({
                pqTestReady: true,
                pqTestFullPath: executable,
                pqTestLocation: directory,
            } as IPQTestService);

            const tasks = await provider.provideTasks(new vscode.CancellationTokenSource().token);
            assert.ok(tasks && tasks.length > 0);

            for (const task of tasks) {
                const definition = task.definition as PowerQueryTaskDefinition;
                const resolved = await provider.resolveTask(task, new vscode.CancellationTokenSource().token);

                if (definition.operation === "run-test") {
                    assert.ok(task.execution instanceof vscode.CustomExecution);
                    assert.ok(resolved?.execution instanceof vscode.CustomExecution);
                } else if (definition.operation !== "msbuild" && definition.operation !== "compile") {
                    assert.ok(task.execution instanceof vscode.ProcessExecution);
                    assert.strictEqual(task.execution.process, executable);
                    assert.ok(resolved?.execution instanceof vscode.ProcessExecution);
                    assert.strictEqual(resolved.execution.process, executable);
                }
            }
        });
    }

    test("changing the deprecated setting does not prompt for reload or show a notice", () => {
        const information = sandbox.stub(vscode.window, "showInformationMessage");

        const onChange = sandbox
            .stub(vscode.workspace, "onDidChangeConfiguration")
            .returns(new vscode.Disposable(() => {}));

        const subscriptions: vscode.Disposable[] = [];
        const bus = new GlobalEventBus({ subscriptions } as vscode.ExtensionContext);

        try {
            onChange.firstCall.args[0]({
                affectsConfiguration: (section: string): boolean =>
                    section === "powerquery.sdk" || section === "powerquery.sdk.features.useServiceHost",
            });

            assert.ok(information.notCalled);
        } finally {
            bus.dispose();
            subscriptions.forEach(disposable => disposable.dispose());
        }
    });

    test("query tasks cancel before building or spawning when saving is declined", async () => {
        const document = mockDocument();
        sandbox.stub(vscode.window, "showWarningMessage").resolves(undefined);
        const spawn = sandbox.stub(childProcess, "spawn");

        const terminal = new PqTestTaskTerminal({
            type: PowerQueryTaskProvider.TaskType,
            operation: "run-test",
            pathToQueryFile: document.uri.fsPath,
        });

        let exitCode: number | undefined;

        terminal.onDidClose(code => {
            exitCode = code;
        });

        await terminal.open(undefined);
        assert.strictEqual(exitCode, 1);
        assert.ok(spawn.notCalled);
        assert.ok((taskUtils.executeBuildTaskAndAwaitIfNeeded as sinon.SinonStub).notCalled);
    });

    test("query tasks run PQTest with the configured connector and propagate process failures", async () => {
        const document = mockDocument({ isDirty: false });
        const originalSpawn = childProcess.spawn.bind(childProcess);

        const spawn = sandbox.stub(childProcess, "spawn").callsFake(() =>
            originalSpawn(process.execPath, ["-e", "process.stderr.write('CLI failed'); process.exitCode = 7;"], {
                env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
            }),
        );

        const terminal = new PqTestTaskTerminal({
            type: PowerQueryTaskProvider.TaskType,
            operation: "run-test",
            pathToQueryFile: document.uri.fsPath,
            pathToConnector: path.join(directory, "Configured.mez"),
        });

        let exitCode: number | undefined;

        terminal.onDidClose(code => {
            exitCode = code;
        });

        await terminal.open(undefined);
        assert.strictEqual(exitCode, 7);
        assert.strictEqual(spawn.firstCall.args[0], executable);
        assert.ok(spawn.firstCall.args[1]?.includes(path.join(directory, "Configured.mez")));
        assert.ok((taskUtils.executeBuildTaskAndAwaitIfNeeded as sinon.SinonStub).calledOnce);
    });

    test("missing PQTest produces an actionable error, without host discovery", async () => {
        fs.unlinkSync(executable);
        const spawn = sandbox.stub(childProcess, "spawn");

        const terminal = new PqTestTaskTerminal({
            type: PowerQueryTaskProvider.TaskType,
            operation: "run-test",
            pathToQueryFile: path.join(directory, "test.query.pq"),
        });

        let output = "";
        let exitCode: number | undefined;

        terminal.onDidWrite(text => {
            output += text;
        });

        terminal.onDidClose(code => {
            exitCode = code;
        });

        await terminal.open(undefined);
        assert.strictEqual(exitCode, 1);
        assert.match(output, /PQTest.exe/);
        assert.ok(spawn.notCalled);
    });

    test("query tasks succeed without a host executable in the tools directory", async () => {
        const spawn = stubCli([{ Value: 42 }]);

        const terminal = new PqTestTaskTerminal({
            type: PowerQueryTaskProvider.TaskType,
            operation: "run-test",
            pathToQueryFile: path.join(directory, "test.query.pq"),
        });

        let exitCode: number | undefined;

        terminal.onDidClose(code => {
            exitCode = code;
        });

        await terminal.open(undefined);
        assert.strictEqual(exitCode, 0);
        assert.strictEqual(spawn.firstCall.args[0], executable);
        assert.ok(!fs.existsSync(path.join(directory, "PQServiceHost.exe")));
    });

    test("query tasks propagate structured failures even when the process exits successfully", async () => {
        stubCli({ Status: "Failure", Message: "Query failed" });

        const terminal = new PqTestTaskTerminal({
            type: PowerQueryTaskProvider.TaskType,
            operation: "run-test",
        });

        let exitCode: number | undefined;

        terminal.onDidClose(code => {
            exitCode = code;
        });

        await terminal.open(undefined);
        assert.strictEqual(exitCode, 1);
    });

    test("closing a query task while saving prevents spawning", async () => {
        const document = mockDocument();
        const prompt: sinon.SinonStub = sandbox.stub(vscode.window, "showWarningMessage");
        let dismiss: (value: undefined) => void = () => {};

        prompt.returns(
            new Promise<undefined>(resolve => {
                dismiss = resolve;
            }),
        );

        const spawn = sandbox.stub(childProcess, "spawn");

        const terminal = new PqTestTaskTerminal({
            type: PowerQueryTaskProvider.TaskType,
            operation: "run-test",
            pathToQueryFile: document.uri.fsPath,
        });

        const running = terminal.open(undefined);
        terminal.close();
        dismiss(undefined);
        await running;
        assert.ok(spawn.notCalled);
    });

    test("saved credential-template tasks retain a CLI execution path with standard input", async () => {
        const provider = new PowerQueryTaskProvider({
            pqTestReady: true,
            pqTestFullPath: executable,
        } as IPQTestService);

        const definition: PowerQueryTaskDefinition = {
            type: PowerQueryTaskProvider.TaskType,
            operation: "set-credential",
            credentialTemplate: { AuthenticationKind: "Anonymous", AuthenticationProperties: {} },
        };

        const source = new vscode.CancellationTokenSource();

        try {
            const task = new vscode.Task(definition, vscode.TaskScope.Workspace, "Set credential", "pqtest");
            const resolved = await provider.resolveTask(task, source.token);
            assert.ok(resolved?.execution instanceof vscode.CustomExecution);
        } finally {
            source.dispose();
        }
    });

    test("VS Code resolves saved query task variables before the CLI starts", async () => {
        const spawn = stubCli([{ Status: "Passed", Output: [{ Result: 42 }] }]);
        let output = "";
        const originalOpen = PqTestTaskTerminal.prototype.open;

        const open = sandbox.stub(PqTestTaskTerminal.prototype, "open").callsFake(async function (
            this: PqTestTaskTerminal,
            dimensions: vscode.TerminalDimensions | undefined,
        ): Promise<void> {
            const subscription = this.onDidWrite(text => {
                output += text;
            });

            try {
                await originalOpen.call(this, dimensions);
            } finally {
                subscription.dispose();
            }
        });

        const folder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(folder);

        const provider = new PowerQueryTaskProvider({
            pqTestReady: true,
            pqTestFullPath: executable,
        } as IPQTestService);

        const definition: PowerQueryTaskDefinition = {
            type: PowerQueryTaskProvider.TaskType,
            operation: "run-test",
            pathToQueryFile: "${workspaceFolder}\\SdkCli.query.pq",
            pathToConnector: "${workspaceFolder}\\Configured.mez",
            label: "CLI variable resolution",
        };

        const source = new vscode.CancellationTokenSource();

        const task = await provider.resolveTask(
            new vscode.Task(definition, vscode.TaskScope.Workspace, "CLI variable resolution", "pqtest"),
            source.token,
        );

        assert.ok(task);
        let subscription: vscode.Disposable | undefined;

        const ended = new Promise<void>(resolve => {
            subscription = vscode.tasks.onDidEndTask(event => {
                if (event.execution.task.name === task.name) {
                    resolve();
                }
            });
        });

        let execution: vscode.TaskExecution | undefined;

        try {
            execution = await vscode.tasks.executeTask(task);
            await ended;
            assert.ok(open.calledOnce, `CLI task terminal did not open. Output: ${output}`);
            assert.ok(spawn.calledOnce, `Expected one CLI process, saw ${spawn.callCount}. Output: ${output}`);
            assert.strictEqual(spawn.firstCall.args[0], executable);
            const args = spawn.firstCall.args[1]?.map((arg: string) => path.normalize(arg).toLowerCase());

            assert.ok(
                args?.includes(path.join(folder.uri.fsPath, "SdkCli.query.pq").toLowerCase()),
                JSON.stringify(spawn.firstCall.args[1]),
            );

            assert.ok(
                args?.includes(path.join(folder.uri.fsPath, "Configured.mez").toLowerCase()),
                JSON.stringify(spawn.firstCall.args[1]),
            );
        } finally {
            if (execution && vscode.tasks.taskExecutions.includes(execution)) {
                execution.terminate();
            }

            subscription?.dispose();
            source.dispose();
        }
    });

    test("credential-template tasks send only the template to the CLI standard input", async () => {
        const originalSpawn = childProcess.spawn.bind(childProcess);

        const spawn = sandbox
            .stub(childProcess, "spawn")
            .callsFake(() =>
                originalSpawn(
                    process.execPath,
                    [
                        "-e",
                        "let input = ''; process.stdin.on('data', c => input += c); process.stdin.on('end', () => { process.stdout.write(JSON.stringify({ Status: JSON.parse(input).AuthenticationKind === 'Anonymous' ? 'Success' : 'Failure' })); });",
                    ],
                    { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } },
                ),
            );

        const terminal = new PqTestTaskTerminal({
            type: PowerQueryTaskProvider.TaskType,
            operation: "set-credential",
            credentialTemplate: { AuthenticationKind: "Anonymous", AuthenticationProperties: {} },
        });

        let exitCode: number | undefined;

        terminal.onDidClose(code => {
            exitCode = code;
        });

        await terminal.open(undefined);
        assert.strictEqual(exitCode, 0);
        assert.strictEqual(spawn.firstCall.args[0], executable);
        assert.ok(!JSON.stringify(spawn.firstCall.args[1]).includes("AuthenticationProperties"));
    });

    test("run/debug cancels and completes without spawning when saving is declined", async () => {
        const document = mockDocument();
        sandbox.stub(vscode.window, "showWarningMessage").resolves(undefined);
        const spawn = sandbox.stub(childProcess, "spawn");
        const task = new PqTestExecutableOnceTask();

        const exited = new Promise<void>(resolve => {
            task.eventBus.on(PqTestExecutableOnceTaskQueueEvents.processExited, resolve);
        });

        try {
            await task.run(document.uri.fsPath, { operation: "run-test" });
            await exited;
            assert.ok(spawn.notCalled);
        } finally {
            task.dispose();
        }
    });

    test("run/debug uses the CLI and still renders successful query results", async () => {
        const result = [{ Value: 42 }];
        const spawn = stubCli(result);
        const command = sandbox.stub(vscode.commands, "executeCommand").resolves();
        const task = new PqTestExecutableOnceTask();

        const exited = new Promise<void>(resolve => {
            task.eventBus.on(PqTestExecutableOnceTaskQueueEvents.processExited, resolve);
        });

        try {
            await task.run(path.join(directory, "test.query.pq"), { operation: "run-test" });
            await exited;
            assert.strictEqual(spawn.firstCall.args[0], executable);
            assert.ok(command.calledOnce);
            assert.deepStrictEqual(command.firstCall.args[1], result);
        } finally {
            task.dispose();
        }
    });

    test("run/debug does not render structured query failures as successful results", async () => {
        stubCli([{ Status: "Failed", Error: { Message: "Query failed" } }]);
        const command = sandbox.stub(vscode.commands, "executeCommand").resolves();
        const task = new PqTestExecutableOnceTask();

        const exited = new Promise<void>(resolve => {
            task.eventBus.on(PqTestExecutableOnceTaskQueueEvents.processExited, resolve);
        });

        try {
            await task.run(path.join(directory, "test.query.pq"), { operation: "run-test" });
            await exited;
            assert.ok(command.notCalled);
        } finally {
            task.dispose();
        }
    });

    test("queued commands cancel before building and reject CLI failures", async () => {
        const document = mockDocument();
        const prompt: sinon.SinonStub = sandbox.stub(vscode.window, "showWarningMessage").resolves(undefined);
        sandbox.stub(ExtensionConfigurations, "DefaultExtensionLocation").get(() => undefined);
        sandbox.stub(ExtensionConfigurations, "DefaultQueryFileLocation").get(() => document.uri.fsPath);
        const context = { extensionPath: directory, subscriptions: [] as vscode.Disposable[] };
        const bus = new GlobalEventBus(context as vscode.ExtensionContext);
        const output = new PqSdkOutputChannel();
        const queue = new PqTestExecutableTaskQueue(context as vscode.ExtensionContext, bus, output);
        const spawn = stubCli({ Status: "Failure", Message: "CLI command failed" });

        try {
            await assert.rejects(queue.RunTestBattery(document.uri.fsPath), /cancelled/i);
            await assert.rejects(queue.TestConnection(), /cancelled/i);
            await assert.rejects(queue.RefreshCredential(), /cancelled/i);
            assert.ok(spawn.notCalled);
            assert.ok((taskUtils.executeBuildTaskAndAwaitIfNeeded as sinon.SinonStub).notCalled);
            prompt.resolves(extensionI18n["PQSdk.query.saveAndRun"]);
            sandbox.stub(document, "isDirty").get(() => false);
            await assert.rejects(queue.RefreshCredential(), /CLI command failed/);
            assert.strictEqual(spawn.firstCall.args[0], executable);
        } finally {
            queue.dispose();
            bus.dispose();
            output.dispose();
            context.subscriptions.forEach(disposable => disposable.dispose());
        }
    });

    test("structured CLI failures remain errors even with a successful process exit", () => {
        assert.strictEqual(inferAnyGeneralErrorString(null), "");
        assert.strictEqual(inferAnyGeneralErrorString({ Status: "Success" }), "");

        assert.strictEqual(
            inferAnyGeneralErrorString({ Status: "Failure", Message: "Refresh failed" }),
            "Refresh failed",
        );

        assert.strictEqual(inferAnyGeneralErrorString([{ ErrorStatus: "Connection failed" }]), "Connection failed");

        assert.strictEqual(
            inferAnyGeneralErrorString([{ Status: "Failed", Error: { Message: "Credentials are required" } }]),
            "Credentials are required",
        );
    });
});

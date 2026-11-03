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
import { Readable } from "stream";
import { setImmediate } from "timers";
import * as vscode from "vscode";

import { PowerQueryTaskDefinition } from "../../common/PowerQueryTask";
import { CreateAuthState, IPQTestService } from "../../common/PQTestService";
import { SpawnedProcessStreaming } from "../../common/SpawnedProcessStreaming";
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
import { TestRunExecutor } from "../../testing/pqtest-adapter/TestRunExecutor";
import * as testSettingsUtils from "../../testing/pqtest-adapter/utils/testSettingsUtils";
import { findExecutable } from "../../utils/executables";
import { ensureFileBackedDocumentsSaved, ensureQueryDocumentSaved } from "../../utils/queryDocuments";

suite("CLI-only execution", () => {
    let sandbox: sinon.SinonSandbox;
    let directory: string;
    let executable: string;
    let directExecutable: string | undefined;
    let documentCollection: sinon.SinonStub;

    setup(() => {
        sandbox = sinon.createSandbox();
        directory = fs.mkdtempSync(path.join(os.tmpdir(), "pq-sdk-cli-"));
        executable = path.join(directory, "PQTest.exe");
        directExecutable = undefined;
        fs.writeFileSync(executable, "");

        const originalDocuments: (() => readonly vscode.TextDocument[]) | undefined = Object.getOwnPropertyDescriptor(
            vscode.workspace,
            "textDocuments",
        )?.get;

        assert.ok(originalDocuments);

        // Earlier UI suites can leave dirty editors open; only expose this test's real documents.
        documentCollection = sandbox.stub(vscode.workspace, "textDocuments").get(() =>
            originalDocuments.call(vscode.workspace).filter(document => {
                const relativePath = path.relative(directory, document.uri.fsPath);

                return !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
            }),
        );

        sandbox.stub(ExtensionConfigurations, "PQTestLocation").get(() => directory);
        sandbox.stub(ExtensionConfigurations, "pqTestExecutablePath").get(() => directExecutable);
        sandbox.stub(ExtensionConfigurations, "getPQTestLocation").resolves(directory);

        sandbox
            .stub(ExtensionConfigurations, "getPqTestExecutablePath")
            .callsFake(() => Promise.resolve(directExecutable));

        sandbox.stub(ExtensionConfigurations, "msbuildPath").get(() => undefined);
        sandbox.stub(taskUtils, "executeBuildTaskAndAwaitIfNeeded").resolves();
    });

    teardown(() => {
        sandbox.restore();
        fs.rmSync(directory, { recursive: true, force: true });
    });

    function mockDocument(
        options: Partial<vscode.TextDocument> = {},
        precedingDocuments: vscode.TextDocument[] = [],
    ): vscode.TextDocument {
        const document: vscode.TextDocument = {
            uri: vscode.Uri.file(path.join(directory, "hidden.query.pq")),
            isDirty: true,
            isUntitled: false,
            save: sandbox.stub().resolves(false),
            ...options,
        } as vscode.TextDocument;

        documentCollection.get(() => [...precedingDocuments, document]);

        return document;
    }

    function chooseSave(): void {
        const prompt: sinon.SinonStub = sandbox.stub(vscode.window, "showWarningMessage");
        prompt.resolves(extensionI18n["PQSdk.query.saveAndRun"]);
    }

    function savedDocument(name: string, scheme: string = "file"): vscode.TextDocument {
        let dirty = true;

        return {
            uri: vscode.Uri.file(path.join(directory, name)).with({ scheme }),
            isUntitled: scheme === "untitled",
            get isDirty(): boolean {
                return dirty;
            },
            save: sandbox.stub().callsFake(() => {
                dirty = false;

                return Promise.resolve(true);
            }) as vscode.TextDocument["save"],
        } as vscode.TextDocument;
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

    for (const kind of ["Key", "UsernamePassword"]) {
        test(`${kind} credentials round-trip quotes, backslashes and control characters through CLI stdin`, async () => {
            sandbox.stub(ExtensionConfigurations, "DefaultExtensionLocation").get(() => undefined);
            const context = { extensionPath: directory, subscriptions: [] as vscode.Disposable[] };
            const bus = new GlobalEventBus(context as vscode.ExtensionContext);
            const output = sandbox.createStubInstance(PqSdkOutputChannel);
            const queue = new PqTestExecutableTaskQueue(context as vscode.ExtensionContext, bus, output);
            const value = 'EXAMPLE\\alice"\\n\n\t';

            const state: CreateAuthState = {
                DataSourceKind: "FakeConnector",
                AuthenticationKind: kind,
                PathToQueryFile: path.join(directory, "fake.query.pq"),
                $$KEY$$: value,
                $$USERNAME$$: value,
                $$PASSWORD$$: value,
            };

            const expectedProperties = kind === "Key" ? { Key: value } : { Username: value, Password: value };

            const originalSpawn = childProcess.spawn.bind(childProcess);

            sandbox
                .stub(childProcess, "spawn")
                .callsFake(() =>
                    originalSpawn(
                        process.execPath,
                        [
                            "-e",
                            "let input = ''; process.stdin.on('data', chunk => input += chunk); process.stdin.on('end', () => { const payload = JSON.parse(input); require('assert').deepStrictEqual(payload.AuthenticationProperties, JSON.parse(process.argv[1])); process.stdout.write(JSON.stringify({Status: 'Success'})); });",
                            JSON.stringify(expectedProperties),
                        ],
                        { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } },
                    ),
                );

            try {
                const result = await queue.SetCredentialFromCreateAuthState(state);
                assert.strictEqual(result.Status, "Success");
            } finally {
                queue.dispose();
                bus.dispose();
                context.subscriptions.forEach(disposable => disposable.dispose());
            }
        });
    }

    for (const operation of ["run-test", "run-compare"]) {
        for (const stdout of ["", "  \n"]) {
            test(`${operation} run/debug accepts ${stdout ? "whitespace" : "empty"} stdout without reporting a JSON error`, async () => {
                const originalSpawn = childProcess.spawn.bind(childProcess);

                sandbox.stub(childProcess, "spawn").callsFake(() =>
                    originalSpawn(process.execPath, ["-e", `process.stdout.write(${JSON.stringify(stdout)});`], {
                        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
                    }),
                );

                const command = sandbox.stub(vscode.commands, "executeCommand").resolves();
                const task = new PqTestExecutableOnceTask();
                const errors: string[] = [];

                task.eventBus.on(PqTestExecutableOnceTaskQueueEvents.onOutput, (category, value) => {
                    if (category === "stdError") {
                        errors.push(value);
                    }
                });

                const exited = new Promise<void>(resolve => {
                    task.eventBus.on(PqTestExecutableOnceTaskQueueEvents.processExited, resolve);
                });

                try {
                    await task.run(path.join(directory, "query.pq"), { operation });
                    await exited;
                    assert.deepStrictEqual(errors, []);
                    assert.ok(command.notCalled);
                } finally {
                    task.dispose();
                }
            });
        }
    }

    test("Test Explorer cancellation during a save prompt prevents process launch", async () => {
        const document = mockDocument();
        const settingsFile = vscode.Uri.file(path.join(directory, "cancel.testsettings.json"));
        fs.writeFileSync(settingsFile.fsPath, "{}");
        const controller = vscode.tests.createTestController("cli-cancel-save", "CLI cancel save");
        const cancellation = new vscode.CancellationTokenSource();
        const testRun = controller.createTestRun(new vscode.TestRunRequest([]));
        const prompt: sinon.SinonStub = sandbox.stub(vscode.window, "showWarningMessage");

        prompt.callsFake(() => {
            cancellation.cancel();

            return Promise.resolve(extensionI18n["PQSdk.query.saveAndRun"]);
        });

        (document.save as sinon.SinonStub).callsFake(() => {
            sandbox.stub(document, "isDirty").get(() => false);

            return Promise.resolve(true);
        });

        sandbox.stub(testSettingsUtils, "determineExtensionsForTests").resolves(undefined);
        sandbox.stub(testSettingsUtils, "buildIntermediateResultsArgs").resolves([]);
        const run = sandbox.stub(SpawnedProcessStreaming.prototype, "run");

        const executor = new TestRunExecutor(
            executable,
            settingsFile,
            testRun,
            sandbox.createStubInstance(PqSdkOutputChannel),
            cancellation.token,
        );

        executor.addTestItem(controller.createTestItem("query", "query", document.uri));

        try {
            await executor.execute();
            assert.ok(prompt.calledOnce);
            assert.ok(run.notCalled);
        } finally {
            testRun.end();
            controller.dispose();
            cancellation.dispose();
        }
    });

    test("Save All and Run saves every dirty file-backed document with one confirmation", async () => {
        const documents = [
            savedDocument("connector.pq"),
            savedDocument("parameters.pq"),
            savedDocument("batch.testsettings.json"),
            savedDocument("README.md"),
            savedDocument("outside.query.pq"),
            savedDocument("untitled", "untitled"),
            savedDocument("history.pq", "git"),
            savedDocument("remote.pq", "custom"),
        ];

        documentCollection.get(() => documents);
        const prompt: sinon.SinonStub = sandbox.stub(vscode.window, "showWarningMessage");
        prompt.resolves(extensionI18n["PQSdk.query.saveAndRun"]);

        await ensureFileBackedDocumentsSaved();
        assert.ok(prompt.calledOnce);
        assert.strictEqual(prompt.firstCall.args[1], "Save All and Run");

        for (const document of documents) {
            assert.strictEqual((document.save as sinon.SinonStub).callCount, document.uri.scheme === "file" ? 1 : 0);
        }
    });

    test("Save All ignores unrelated untitled and non-file documents without prompting", async () => {
        const documents = [savedDocument("untitled", "untitled"), savedDocument("history.pq", "git")];
        documentCollection.get(() => documents);
        const prompt = sandbox.stub(vscode.window, "showWarningMessage");

        await ensureFileBackedDocumentsSaved();
        assert.ok(prompt.notCalled);
        assert.ok(documents.every(document => (document.save as sinon.SinonStub).notCalled));
    });

    test("Save All persists actual VS Code documents, including a settings file", async () => {
        const files = [path.join(directory, "connector.pq"), path.join(directory, "batch.testsettings.json")];
        const documents: vscode.TextDocument[] = [];

        for (const file of files) {
            fs.writeFileSync(file, "1");

            documents.push(await vscode.workspace.openTextDocument(vscode.Uri.file(file)));
        }

        const edits = new vscode.WorkspaceEdit();
        documents.forEach(document => edits.insert(document.uri, new vscode.Position(0, 0), "2"));
        assert.ok(await vscode.workspace.applyEdit(edits));
        assert.ok(documents.every(document => document.isDirty));
        const prompt: sinon.SinonStub = sandbox.stub(vscode.window, "showWarningMessage");
        prompt.resolves(extensionI18n["PQSdk.query.saveAndRun"]);

        try {
            await ensureFileBackedDocumentsSaved();
            assert.ok(prompt.calledOnce);
            assert.ok(documents.every(document => !document.isDirty));
            assert.ok(files.every(file => fs.readFileSync(file, "utf8") === "21"));
        } finally {
            await Promise.all(documents.map(document => document.save()));
        }
    });

    test("declining Save All leaves every document unchanged", async () => {
        const documents = [savedDocument("connector.pq"), savedDocument("README.md")];
        documentCollection.get(() => documents);
        sandbox.stub(vscode.window, "showWarningMessage").resolves(undefined);

        await assert.rejects(ensureFileBackedDocumentsSaved(), /cancelled/i);
        assert.ok(documents.every(document => document.isDirty));
        assert.ok(documents.every(document => (document.save as sinon.SinonStub).notCalled));
    });

    test("Save All rechecks documents opened or dirtied while prompting and saving without another prompt", async () => {
        let firstDirty = false;
        const documents: vscode.TextDocument[] = [];

        const first = {
            uri: vscode.Uri.file(path.join(directory, "first.pq")),
            get isDirty(): boolean {
                return firstDirty;
            },
            save: sandbox.stub().callsFake(() => {
                firstDirty = false;

                return Promise.resolve(true);
            }) as vscode.TextDocument["save"],
        } as vscode.TextDocument;

        const second = savedDocument("second.json");
        const third = savedDocument("opened-during-prompt.md");
        const fourth = savedDocument("opened-during-save.pq");
        documents.push(first, second);
        documentCollection.get(() => documents);
        const prompt: sinon.SinonStub = sandbox.stub(vscode.window, "showWarningMessage");

        prompt.callsFake(() => {
            documents.push(third);

            return Promise.resolve(extensionI18n["PQSdk.query.saveAndRun"]);
        });

        (second.save as sinon.SinonStub).callsFake(() => {
            sandbox.stub(second, "isDirty").get(() => false);
            firstDirty = true;
            documents.push(fourth);

            return Promise.resolve(true);
        });

        await ensureFileBackedDocumentsSaved();
        assert.ok(prompt.calledOnce);
        assert.ok(documents.every(document => !document.isDirty));
        assert.ok(documents.every(document => (document.save as sinon.SinonStub).calledOnce));
    });

    test("concurrent execution preflights share one Save All decision", async () => {
        const document = savedDocument("connector.pq");
        documentCollection.get(() => [document]);
        const prompt: sinon.SinonStub = sandbox.stub(vscode.window, "showWarningMessage");
        let decide: (value: string | undefined) => void = () => {};

        prompt.returns(
            new Promise<string | undefined>(resolve => {
                decide = resolve;
            }),
        );

        const first = ensureFileBackedDocumentsSaved();
        const second = ensureFileBackedDocumentsSaved();
        assert.ok(prompt.calledOnce);
        assert.ok((document.save as sinon.SinonStub).notCalled);
        decide(extensionI18n["PQSdk.query.saveAndRun"]);
        await Promise.all([first, second]);
        assert.ok((document.save as sinon.SinonStub).calledOnce);
    });

    test("an unrelated dirty document still requires saving before a query can run", async () => {
        const document = mockDocument({ uri: vscode.Uri.file(path.join(directory, "README.md")) });
        sandbox.stub(vscode.window, "showWarningMessage").resolves(undefined);

        await assert.rejects(ensureQueryDocumentSaved(path.join(directory, "other.query.pq")), /cancelled/i);
        assert.ok((document.save as sinon.SinonStub).notCalled);
    });

    test("clean files do not prompt or save", async () => {
        const document = mockDocument({ isDirty: false });
        const prompt = sandbox.stub(vscode.window, "showWarningMessage");

        await ensureQueryDocumentSaved(document.uri.fsPath);
        assert.ok(prompt.notCalled);
        assert.ok((document.save as sinon.SinonStub).notCalled);
    });

    for (const dirty of [false, true]) {
        test(`Git revision documents cannot shadow a ${dirty ? "dirty" : "clean"} local query`, async () => {
            const revision = {
                uri: vscode.Uri.file(path.join(directory, "hidden.query.pq")).with({
                    scheme: "git",
                    query: '{"ref":"HEAD"}',
                }),
                isDirty: false,
                isUntitled: false,
            } as vscode.TextDocument;

            const document = mockDocument({ isDirty: dirty }, [revision]);
            const prompt: sinon.SinonStub = sandbox.stub(vscode.window, "showWarningMessage").resolves(undefined);

            if (dirty) {
                await assert.rejects(ensureQueryDocumentSaved(document.uri), /cancelled/i);
                assert.ok(prompt.calledOnce);
            } else {
                await ensureQueryDocumentSaved(document.uri);
                assert.ok(prompt.notCalled);
            }
        });
    }

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

    test("untitled query URIs are rejected before resolving paths against the execution directory", async () => {
        const document = mockDocument({ uri: vscode.Uri.parse("untitled:Untitled-1"), isUntitled: true });

        await assert.rejects(ensureQueryDocumentSaved(document.uri, directory), /local file/);
        assert.ok((document.save as sinon.SinonStub).notCalled);
        await ensureQueryDocumentSaved("Untitled-1", directory);
    });

    test("relative query save checks use the execution directory rather than the extension host directory", async () => {
        const document = mockDocument();
        sandbox.stub(vscode.window, "showWarningMessage").resolves(undefined);

        await assert.rejects(ensureQueryDocumentSaved(path.basename(document.uri.fsPath), directory), /cancelled/i);
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

                if (definition.operation !== "msbuild" && definition.operation !== "compile") {
                    assert.ok(task.execution instanceof vscode.CustomExecution);
                    assert.ok(resolved?.execution instanceof vscode.CustomExecution);
                } else {
                    assert.ok(task.execution instanceof vscode.ProcessExecution);
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

    for (const failure of ["false", "still dirty", "exception"]) {
        test(`a ${failure} Save All failure prevents task execution`, async () => {
            const document = mockDocument({ uri: vscode.Uri.file(path.join(directory, "README.md")) });
            chooseSave();

            if (failure === "still dirty") {
                (document.save as sinon.SinonStub).resolves(true);
            } else if (failure === "exception") {
                (document.save as sinon.SinonStub).rejects(new Error("Write failed"));
            }

            const spawn = sandbox.stub(childProcess, "spawn");

            const terminal = new PqTestTaskTerminal({
                type: PowerQueryTaskProvider.TaskType,
                operation: "run-test",
                additionalArgs: ["-q", "test.query.pq"],
            });

            let exitCode: number | undefined;
            let output = "";

            terminal.onDidClose(code => {
                exitCode = code;
            });

            terminal.onDidWrite(value => {
                output += value;
            });

            await terminal.open(undefined);
            assert.strictEqual(exitCode, 1);
            assert.ok(spawn.notCalled);
            assert.match(output, failure === "exception" ? /Write failed/ : /could not be saved/);
        });
    }

    test("query tasks run PQTest with the configured connector and propagate process failures", async () => {
        (taskUtils.executeBuildTaskAndAwaitIfNeeded as sinon.SinonStub).rejects(new Error("Unexpected build"));
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
        assert.ok((taskUtils.executeBuildTaskAndAwaitIfNeeded as sinon.SinonStub).notCalled);
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

    for (const stdout of ["", " \r\n"]) {
        test(`tasks with suppressed stdout ${JSON.stringify(stdout)} retain the successful process exit`, async () => {
            const settingsFile = path.join(directory, "skip-output.json");
            fs.writeFileSync(settingsFile, JSON.stringify({ SkipOutput: true }));
            const originalSpawn = childProcess.spawn.bind(childProcess);

            sandbox.stub(childProcess, "spawn").callsFake(() =>
                originalSpawn(process.execPath, ["-e", `process.stdout.write(${JSON.stringify(stdout)});`], {
                    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
                }),
            );

            const terminal = new PqTestTaskTerminal({
                type: PowerQueryTaskProvider.TaskType,
                operation: "run-test",
                settingsFile,
            });

            let exitCode: number | undefined;

            terminal.onDidClose(code => {
                exitCode = code;
            });

            await terminal.open(undefined);
            assert.strictEqual(exitCode, 0);
        });
    }

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

    test("query tasks report failed test batteries without losing their output", async () => {
        stubCli([{ Status: "Passed" }, { Status: "Failed", Error: { Message: "Query failed" } }]);
        const terminal = new PqTestTaskTerminal({ type: PowerQueryTaskProvider.TaskType, operation: "run-test" });
        let exitCode: number | undefined;
        let output = "";

        terminal.onDidClose(code => {
            exitCode = code;
        });

        terminal.onDidWrite(text => {
            output += text;
        });

        await terminal.open(undefined);
        assert.strictEqual(exitCode, 1);
        assert.match(output, /Query failed/);
    });

    test("relative query paths check the dirty document in the task working directory", async () => {
        mockDocument();
        sandbox.stub(vscode.window, "showWarningMessage").resolves(undefined);
        const spawn = sandbox.stub(childProcess, "spawn");

        const terminal = new PqTestTaskTerminal({
            type: PowerQueryTaskProvider.TaskType,
            operation: "run-test",
            workingDirectory: directory,
            pathToQueryFile: "hidden.query.pq",
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

    for (const additionalArgs of [
        [],
        ["--queryFile", "hidden.query.pq"],
        ["--queryFile=hidden.query.pq"],
        ["-q", "hidden.query.pq"],
        ["-q=hidden.query.pq"],
        ["--settingsFile", "batch.json"],
        ["--settingsFile=batch.json"],
        ["-sf", "batch.json"],
        ["-sf=batch.json"],
        ["--parameterQueryFile", "hidden.query.pq"],
        ["--parameterQueryFile=hidden.query.pq"],
        ["-pa", "hidden.query.pq"],
        ["-pa=hidden.query.pq"],
        ["-tf", "other.query.pq"],
        ["--testFilter=other.query.pq"],
    ]) {
        test(`saved native tasks cannot bypass the save guard through ${additionalArgs.join(" ")}`, async () => {
            const document = mockDocument();

            fs.writeFileSync(path.join(directory, "batch.json"), JSON.stringify({ QueryFilePath: "hidden.query.pq" }));

            sandbox.stub(vscode.window, "showWarningMessage").resolves(undefined);
            const nativeTask = sandbox.stub(vscode.tasks, "executeTask");

            const provider = new PowerQueryTaskProvider({
                pqTestReady: true,
                pqTestFullPath: executable,
            } as IPQTestService);

            const definition: PowerQueryTaskDefinition = {
                type: PowerQueryTaskProvider.TaskType,
                operation: "run-compare",
                additionalArgs,
                options: { cwd: directory },
            };

            const cancellation = new vscode.CancellationTokenSource();

            try {
                const resolved = await provider.resolveTask(
                    new vscode.Task(definition, vscode.TaskScope.Workspace, "guard arguments", "pqtest"),
                    cancellation.token,
                );

                assert.ok(resolved?.execution instanceof vscode.CustomExecution);
                const terminal = new PqTestTaskTerminal(definition);
                let exitCode: number | undefined;

                terminal.onDidClose(code => {
                    exitCode = code;
                });

                await terminal.open(undefined);
                assert.strictEqual(exitCode, 1);
                assert.ok(nativeTask.notCalled);
                assert.ok((document.save as sinon.SinonStub).notCalled);
            } finally {
                cancellation.dispose();
            }
        });
    }

    for (const operation of ["run-test", "set-credential"]) {
        test(`${operation} save guards resolve relative queries against options.cwd`, async () => {
            const document = mockDocument({ uri: vscode.Uri.file(path.join(directory, "tests", "hidden.query.pq")) });
            sandbox.stub(vscode.window, "showWarningMessage").resolves(undefined);
            const spawn = sandbox.stub(childProcess, "spawn");
            const executeTask = sandbox.stub(vscode.tasks, "executeTask");

            const terminal = new PqTestTaskTerminal(
                {
                    type: PowerQueryTaskProvider.TaskType,
                    operation,
                    workingDirectory: directory,
                    options: { cwd: "tests" },
                    pathToQueryFile: "hidden.query.pq",
                    additionalArgs: operation === "set-credential" ? ["--interactive"] : undefined,
                },
                executable,
                directory,
            );

            let exitCode: number | undefined;

            terminal.onDidClose(code => {
                exitCode = code;
            });

            await terminal.open(undefined);
            assert.strictEqual(exitCode, 1);
            assert.ok(spawn.notCalled);
            assert.ok(executeTask.notCalled);
            assert.ok((document.save as sinon.SinonStub).notCalled);
        });
    }

    test("spawned query tasks apply options.cwd and merge options.env with inherited variables", async () => {
        const testsDirectory = path.join(directory, "tests");
        fs.mkdirSync(testsDirectory);
        fs.writeFileSync(path.join(testsDirectory, "task.query.pq"), "1");
        sandbox.stub(process, "env").value({ ...process.env, PQSDK_TEST_TASK_OPTION: "inherited" });
        const variableName = process.platform === "win32" ? "pqsdk_test_task_option" : "PQSDK_TEST_TASK_OPTION";
        const originalSpawn = childProcess.spawn.bind(childProcess);

        const spawn = sandbox
            .stub(childProcess, "spawn")
            .callsFake((_command, _args, options) =>
                originalSpawn(
                    process.execPath,
                    [
                        "-e",
                        "const ok = process.env.PQSDK_TEST_TASK_OPTION === 'configured' && process.env.PATH !== undefined && require('fs').existsSync('task.query.pq'); process.stdout.write(JSON.stringify({ Status: ok ? 'Success' : 'Failure', Message: 'Task options not applied' }));",
                    ],
                    { ...options, env: { ...options?.env, ELECTRON_RUN_AS_NODE: "1" } },
                ),
            );

        const terminal = new PqTestTaskTerminal(
            {
                type: PowerQueryTaskProvider.TaskType,
                operation: "run-test",
                pathToQueryFile: "task.query.pq",
                options: { cwd: "tests", env: { [variableName]: "configured" } },
            },
            executable,
            directory,
        );

        let exitCode: number | undefined;

        terminal.onDidClose(code => {
            exitCode = code;
        });

        await terminal.open(undefined);
        assert.strictEqual(exitCode, 0);
        assert.strictEqual(spawn.firstCall.args[2]?.cwd, testsDirectory);
    });

    for (const operation of [
        "test-connection",
        "refresh-credential",
        "credential-template",
        "run-compare",
        "set-credential",
    ]) {
        test(`${operation} tasks cancel without spawning when saving the query is declined`, async () => {
            const document = mockDocument();
            sandbox.stub(vscode.window, "showWarningMessage").resolves(undefined);
            const spawn = sandbox.stub(childProcess, "spawn");
            const executeTask = sandbox.stub(vscode.tasks, "executeTask");

            const terminal = new PqTestTaskTerminal({
                type: PowerQueryTaskProvider.TaskType,
                operation,
                pathToQueryFile: document.uri.fsPath,
                additionalArgs: operation === "set-credential" ? ["--interactive"] : undefined,
            });

            let exitCode: number | undefined;

            terminal.onDidClose(code => {
                exitCode = code;
            });

            await terminal.open(undefined);
            assert.strictEqual(exitCode, 1);
            assert.ok(spawn.notCalled);
            assert.ok(executeTask.notCalled);
        });
    }

    for (const operation of ["credential-template", "run-compare"]) {
        test(`saved ${operation} tasks validate query saves without parsing their operation-specific output as query results`, async () => {
            const provider = new PowerQueryTaskProvider({
                pqTestReady: true,
                pqTestFullPath: executable,
            } as IPQTestService);

            const definition: PowerQueryTaskDefinition = {
                type: PowerQueryTaskProvider.TaskType,
                operation,
                pathToQueryFile: path.join(directory, "test.query.pq"),
            };

            const cancellation = new vscode.CancellationTokenSource();
            const node = findExecutable("node", [".exe", ""]);
            assert.ok(node);
            const originalExecuteTask = vscode.tasks.executeTask.bind(vscode.tasks);

            const output: string =
                operation === "credential-template"
                    ? JSON.stringify({ AuthenticationKind: "Anonymous", AuthenticationProperties: {} })
                    : 'runStart:{"tests":[]}\nrunEnd:{"passed":0,"failed":0}\n';

            const executeTask = sandbox.stub(vscode.tasks, "executeTask").callsFake(task => {
                assert.ok(task.execution instanceof vscode.ProcessExecution);
                assert.ok(task.execution.args.includes(operation));

                task.execution = new vscode.ProcessExecution(node, [
                    "-e",
                    `process.stdout.write(${JSON.stringify(output)});`,
                ]);

                return originalExecuteTask(task);
            });

            try {
                const resolved = await provider.resolveTask(
                    new vscode.Task(definition, vscode.TaskScope.Workspace, operation, "pqtest"),
                    cancellation.token,
                );

                assert.ok(resolved?.execution instanceof vscode.CustomExecution);
                const terminal = new PqTestTaskTerminal(definition);
                let exitCode: number | undefined;

                terminal.onDidClose?.(code => {
                    exitCode = typeof code === "number" ? code : undefined;
                });

                await terminal.open(undefined);
                assert.strictEqual(exitCode, 0);
                assert.ok(executeTask.calledOnce);
            } finally {
                cancellation.dispose();
            }
        });
    }

    test("interactive task startup failures dispose native-task listeners and report the failure", async () => {
        const taskDisposed = sandbox.spy();
        const processDisposed = sandbox.spy();
        sandbox.stub(vscode.tasks, "onDidEndTask").returns(new vscode.Disposable(taskDisposed));
        sandbox.stub(vscode.tasks, "onDidEndTaskProcess").returns(new vscode.Disposable(processDisposed));
        sandbox.stub(vscode.tasks, "executeTask").rejects(new Error("Cannot start interactive PQTest"));

        const terminal = new PqTestTaskTerminal({
            type: PowerQueryTaskProvider.TaskType,
            operation: "set-credential",
            additionalArgs: ["--interactive"],
        });

        let exitCode: number | undefined;
        let output = "";

        terminal.onDidClose(code => {
            exitCode = code;
        });

        terminal.onDidWrite(text => {
            output += text;
        });

        await terminal.open(undefined);
        assert.strictEqual(exitCode, 1);
        assert.match(output, /Cannot start interactive PQTest/);
        assert.ok(taskDisposed.calledOnce);
        assert.ok(processDisposed.calledOnce);
    });

    test("closing an interactive task cancels its native task even while startup is pending", async () => {
        const taskEnded = new vscode.EventEmitter<vscode.TaskEndEvent>();
        const processEnded = new vscode.EventEmitter<vscode.TaskProcessEndEvent>();
        sandbox.stub(vscode.tasks, "onDidEndTask").callsFake(taskEnded.event);
        sandbox.stub(vscode.tasks, "onDidEndTaskProcess").callsFake(processEnded.event);
        let started: () => void = () => {};
        let release: () => void = () => {};

        const starting = new Promise<void>(resolve => {
            started = resolve;
        });

        const startup = new Promise<void>(resolve => {
            release = resolve;
        });

        const terminate = sandbox.stub();

        sandbox.stub(vscode.tasks, "executeTask").callsFake(async task => {
            const execution: vscode.TaskExecution = { task, terminate };

            terminate.callsFake(() => {
                processEnded.fire({ execution, exitCode: undefined });
                taskEnded.fire({ execution });
            });

            started();
            await startup;

            return execution;
        });

        const terminal = new PqTestTaskTerminal({
            type: PowerQueryTaskProvider.TaskType,
            operation: "set-credential",
            additionalArgs: ["--interactive"],
        });

        try {
            const pending = terminal.open(undefined);
            await starting;
            terminal.close();
            release();
            await pending;
            assert.ok(terminate.calledOnce);
        } finally {
            release();
            terminal.close();
            taskEnded.dispose();
            processEnded.dispose();
        }
    });

    for (const exitCode of [0, 7, undefined]) {
        test(`interactive credential tasks save before native terminal execution and propagate exit code ${exitCode}`, async () => {
            const document = mockDocument();

            (document.save as sinon.SinonStub).callsFake(() => {
                sandbox.stub(document, "isDirty").get(() => false);

                return Promise.resolve(true);
            });

            chooseSave();
            const taskEnded = new vscode.EventEmitter<vscode.TaskEndEvent>();
            const processEnded = new vscode.EventEmitter<vscode.TaskProcessEndEvent>();
            sandbox.stub(vscode.tasks, "onDidEndTask").callsFake(taskEnded.event);
            sandbox.stub(vscode.tasks, "onDidEndTaskProcess").callsFake(processEnded.event);

            const executeTask = sandbox.stub(vscode.tasks, "executeTask").callsFake(task => {
                assert.ok((document.save as sinon.SinonStub).calledOnce);
                assert.ok(task.execution instanceof vscode.ProcessExecution);
                assert.ok(task.execution.args.includes("--interactive"));
                assert.ok(task.execution.args.includes(document.uri.fsPath));
                assert.strictEqual(task.execution.process, executable);
                assert.strictEqual(task.execution.options?.cwd, directory);
                assert.strictEqual(task.definition.type, "process");

                const execution: vscode.TaskExecution = { task, terminate: sandbox.stub() };

                setImmediate(() => {
                    processEnded.fire({ execution, exitCode });
                    taskEnded.fire({ execution });
                });

                return Promise.resolve(execution);
            });

            const spawn = sandbox.stub(childProcess, "spawn");

            const terminal = new PqTestTaskTerminal(
                {
                    type: PowerQueryTaskProvider.TaskType,
                    operation: "set-credential",
                    pathToQueryFile: document.uri.fsPath,
                    additionalArgs: ["--interactive"],
                },
                executable,
                directory,
            );

            let result: number | undefined;

            terminal.onDidClose(code => {
                result = code;
            });

            try {
                await terminal.open(undefined);
                assert.strictEqual(result, exitCode ?? 1);
                assert.ok(executeTask.calledOnce);
                assert.ok(spawn.notCalled);
            } finally {
                terminal.close();
                taskEnded.dispose();
                processEnded.dispose();
            }
        });
    }

    test("a guarded interactive task launches a real native process task without resolving itself again", async () => {
        const node = findExecutable("node", [".exe", ""]);
        assert.ok(node);
        const document = mockDocument();

        (document.save as sinon.SinonStub).callsFake(() => {
            sandbox.stub(document, "isDirty").get(() => false);

            return Promise.resolve(true);
        });

        chooseSave();
        const originalExecuteTask = vscode.tasks.executeTask.bind(vscode.tasks);
        let nativeTask: vscode.Task | undefined;

        sandbox.stub(vscode.tasks, "executeTask").callsFake(task => {
            if (task.execution instanceof vscode.ProcessExecution && task.definition.type === "process") {
                assert.ok((document.save as sinon.SinonStub).calledOnce);
                assert.ok(task.execution.args.includes("--interactive"));
                nativeTask = task;
                assert.strictEqual(task.execution.options?.cwd, directory);
                assert.strictEqual(task.execution.options?.env?.PQSDK_TEST_TASK_OPTION, "native");

                task.execution = new vscode.ProcessExecution(
                    node,
                    [
                        "-e",
                        `process.exit(process.env.PQSDK_TEST_TASK_OPTION === 'native' && process.cwd().toLowerCase() === ${JSON.stringify(directory.toLowerCase())} ? 0 : 7);`,
                    ],
                    task.execution.options,
                );
            }

            return originalExecuteTask(task);
        });

        const provider = new PowerQueryTaskProvider({
            pqTestReady: true,
            pqTestFullPath: executable,
        } as IPQTestService);

        const cancellation = new vscode.CancellationTokenSource();

        try {
            const task = await provider.resolveTask(
                new vscode.Task(
                    {
                        type: PowerQueryTaskProvider.TaskType,
                        operation: "set-credential",
                        pathToQueryFile: document.uri.fsPath,
                        additionalArgs: ["--interactive"],
                        options: { cwd: directory, env: { PQSDK_TEST_TASK_OPTION: "native" } },
                        label: "CLI guarded interactive credential",
                    },
                    vscode.TaskScope.Workspace,
                    "CLI guarded interactive credential",
                    "pqtest",
                ),
                cancellation.token,
            );

            assert.ok(task?.execution instanceof vscode.CustomExecution);
            await PowerQueryTaskProvider.executeTask(task);
            assert.ok(nativeTask);
        } finally {
            cancellation.dispose();
        }
    });

    for (const exitCode of [0, 1, undefined]) {
        test(`build tasks settle with process exit code ${exitCode} and dispose their listeners`, async () => {
            const taskEnded = new vscode.EventEmitter<vscode.TaskEndEvent>();
            const processEnded = new vscode.EventEmitter<vscode.TaskProcessEndEvent>();
            const taskSubscription = sandbox.stub(vscode.tasks, "onDidEndTask").callsFake(taskEnded.event);
            const processSubscription = sandbox.stub(vscode.tasks, "onDidEndTaskProcess").callsFake(processEnded.event);

            const task = new vscode.Task(
                { type: PowerQueryTaskProvider.TaskType },
                vscode.TaskScope.Workspace,
                "compile",
                "build",
                new vscode.ProcessExecution(executable),
            );

            const execution: vscode.TaskExecution = { task, terminate: sandbox.stub() };
            sandbox.stub(vscode.tasks, "executeTask").resolves(execution);

            try {
                const pending = PowerQueryTaskProvider.executeTask(task);
                const taskDisposed = sandbox.spy(taskSubscription.firstCall.returnValue, "dispose");
                const processDisposed = sandbox.spy(processSubscription.firstCall.returnValue, "dispose");
                processEnded.fire({ execution, exitCode });
                taskEnded.fire({ execution });

                if (exitCode === 0) {
                    assert.strictEqual(await pending, execution);
                } else {
                    await assert.rejects(pending, /compile.*failed or was cancelled/);
                }

                assert.ok(taskDisposed.calledOnce);
                assert.ok(processDisposed.calledOnce);
            } finally {
                taskEnded.dispose();
                processEnded.dispose();
            }
        });
    }

    test("build startup failures reject and dispose their listeners", async () => {
        const taskDisposed = sandbox.spy();
        const processDisposed = sandbox.spy();
        sandbox.stub(vscode.tasks, "onDidEndTask").returns(new vscode.Disposable(taskDisposed));
        sandbox.stub(vscode.tasks, "onDidEndTaskProcess").returns(new vscode.Disposable(processDisposed));
        sandbox.stub(vscode.tasks, "executeTask").rejects(new Error("Cannot start compiler"));
        const task = PowerQueryTaskProvider.buildMakePQXCompileTask(directory);

        await assert.rejects(PowerQueryTaskProvider.executeTask(task), /Cannot start compiler/);
        assert.ok(taskDisposed.calledOnce);
        assert.ok(processDisposed.calledOnce);
    });

    test("provided MakePQX builds remain native and do not enter the PQTest save preflight", async () => {
        const document = mockDocument();
        const prompt = sandbox.stub(vscode.window, "showWarningMessage");
        const task = PowerQueryTaskProvider.buildMakePQXCompileTask(directory);
        assert.ok(task.execution instanceof vscode.ProcessExecution);
        assert.strictEqual(task.execution.process, path.join(directory, "MakePQX.exe"));
        assert.deepStrictEqual(task.execution.args, ["compile"]);
        const node = findExecutable("node", [".exe", ""]);
        assert.ok(node);
        task.execution = new vscode.ProcessExecution(node, ["-e", "process.exit(0)"]);

        await PowerQueryTaskProvider.executeTask(task);
        assert.ok(prompt.notCalled);
        assert.ok((document.save as sinon.SinonStub).notCalled);
    });

    for (const exitCode of [0, 7]) {
        test(`actual build process completion propagates exit code ${exitCode}`, async () => {
            const node = findExecutable("node", [".exe", ""]);
            assert.ok(node);

            const task = new vscode.Task(
                { type: PowerQueryTaskProvider.TaskType },
                vscode.TaskScope.Workspace,
                `CLI review build ${exitCode}`,
                "build",
                new vscode.ProcessExecution(node, ["-e", `process.exit(${exitCode})`]),
                [],
            );

            if (exitCode === 0) {
                assert.strictEqual((await PowerQueryTaskProvider.executeTask(task)).task.name, task.name);
            } else {
                await assert.rejects(PowerQueryTaskProvider.executeTask(task), /failed or was cancelled/);
            }
        });
    }

    test("closing a query task while saving prevents spawning", async () => {
        const document = mockDocument();
        const prompt: sinon.SinonStub = sandbox.stub(vscode.window, "showWarningMessage");
        let dismiss: (value: string | undefined) => void = () => {};
        let promptShown: () => void = () => {};

        const shown = new Promise<void>(resolve => {
            promptShown = resolve;
        });

        prompt.callsFake(() => {
            promptShown();

            return new Promise<string | undefined>(resolve => {
                dismiss = resolve;
            });
        });

        (document.save as sinon.SinonStub).callsFake(() => {
            sandbox.stub(document, "isDirty").get(() => false);

            return Promise.resolve(true);
        });

        const spawn = sandbox.stub(childProcess, "spawn");

        const terminal = new PqTestTaskTerminal({
            type: PowerQueryTaskProvider.TaskType,
            operation: "run-test",
            pathToQueryFile: document.uri.fsPath,
        });

        const running = terminal.open(undefined);
        await shown;
        terminal.close();
        dismiss(extensionI18n["PQSdk.query.saveAndRun"]);
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
        directExecutable = path.join(directory, "override", "PQTest.exe");
        fs.mkdirSync(path.dirname(directExecutable));
        fs.writeFileSync(directExecutable, "");
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
            new vscode.Task(definition, folder, "CLI variable resolution", "pqtest"),
            source.token,
        );

        assert.ok(task);
        assert.strictEqual(task.scope, folder);
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

            assert.strictEqual(
                path.normalize(spawn.firstCall.args[2]?.cwd as string).toLowerCase(),
                path.normalize(folder.uri.fsPath).toLowerCase(),
            );

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

    test("saved tasks.json options survive resolution and VS Code substitutes their variables", async () => {
        const folder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(folder);
        const taskDirectory = fs.mkdtempSync(path.join(folder.uri.fsPath, "pq-sdk-cli-options-"));
        fs.writeFileSync(path.join(taskDirectory, "batch.json"), JSON.stringify({ QueryFilePath: "task.query.pq" }));
        const configuration = vscode.workspace.getConfiguration("tasks", folder.uri);
        const previousTasks = configuration.inspect<unknown[]>("tasks")?.workspaceFolderValue;
        const previousVersion = configuration.inspect<string>("version")?.workspaceFolderValue;
        const configPath = path.join(folder.uri.fsPath, ".vscode", "tasks.json");
        const configExisted = fs.existsSync(configPath);
        const configDirectoryExisted = fs.existsSync(path.dirname(configPath));
        const spawn = stubCli([{ Status: "Passed", Output: [{ Result: 42 }] }]);

        const provider = new PowerQueryTaskProvider({
            pqTestReady: true,
            pqTestFullPath: executable,
        } as IPQTestService);

        sandbox.stub(provider, "provideTasks").resolves([]);
        const registration = vscode.tasks.registerTaskProvider(PowerQueryTaskProvider.TaskType, provider);
        const cancellation = new vscode.CancellationTokenSource();
        const originalOpen = PqTestTaskTerminal.prototype.open;
        let output = "";

        sandbox.stub(PqTestTaskTerminal.prototype, "open").callsFake(async function (
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

        try {
            await configuration.update("version", "2.0.0", vscode.ConfigurationTarget.WorkspaceFolder);

            await configuration.update(
                "tasks",
                [
                    {
                        type: PowerQueryTaskProvider.TaskType,
                        operation: "run-test",
                        label: "CLI saved task options",
                        additionalArgs: ["--queryFile", "task.query.pq"],
                        settingsFile: `\${workspaceFolder}\\${path.basename(taskDirectory)}\\batch.json`,
                        pathToConnector: "connector.mez",
                        options: {
                            cwd: `\${workspaceFolder}\\${path.basename(taskDirectory)}`,
                            env: { PQSDK_TEST_TASK_OPTION: "${workspaceFolder}" },
                        },
                        problemMatcher: [],
                    },
                ],
                vscode.ConfigurationTarget.WorkspaceFolder,
            );

            const tasks = await vscode.tasks.fetchTasks({ type: PowerQueryTaskProvider.TaskType });
            const task = tasks.find(candidate => candidate.name === "CLI saved task options");

            assert.ok(
                task,
                `The saved Power Query task must be discovered; found ${tasks.map(candidate => candidate.name).join(", ")}`,
            );

            const resolved = await provider.resolveTask(task, cancellation.token);
            assert.ok(resolved);

            await PowerQueryTaskProvider.executeTask(resolved).then(undefined, error => {
                assert.fail(`${String(error)}; task output: ${output}; CLI launches: ${spawn.callCount}`);
            });

            assert.ok(spawn.calledOnce);

            assert.strictEqual(
                path.resolve(spawn.firstCall.args[2]?.cwd as string).toLowerCase(),
                taskDirectory.toLowerCase(),
            );

            assert.strictEqual(
                spawn.firstCall.args[2]?.env?.PQSDK_TEST_TASK_OPTION?.toLowerCase(),
                folder.uri.fsPath.toLowerCase(),
            );

            assert.ok(spawn.firstCall.args[1]?.includes("task.query.pq"));
            assert.ok(spawn.firstCall.args[1]?.includes("connector.mez"));
            assert.ok(spawn.firstCall.args[1]?.includes("--settingsFile"));

            assert.ok(
                spawn.firstCall.args[1]?.some(
                    (arg: string) => arg.toLowerCase() === path.join(taskDirectory, "batch.json").toLowerCase(),
                ),
            );
        } finally {
            registration.dispose();
            cancellation.dispose();
            await configuration.update("tasks", previousTasks, vscode.ConfigurationTarget.WorkspaceFolder);
            await configuration.update("version", previousVersion, vscode.ConfigurationTarget.WorkspaceFolder);

            if (!configExisted && fs.existsSync(configPath)) {
                fs.unlinkSync(configPath);
            }

            if (!configDirectoryExisted && fs.existsSync(path.dirname(configPath))) {
                fs.rmdirSync(path.dirname(configPath));
            }

            fs.unlinkSync(path.join(taskDirectory, "batch.json"));
            fs.rmdirSync(taskDirectory);
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
        (taskUtils.executeBuildTaskAndAwaitIfNeeded as sinon.SinonStub).rejects(new Error("Unexpected build"));
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

    for (const operation of ["run-test", "test-connection"]) {
        for (const duringBuild of ["dirty", "saved", "cancelled"]) {
            test(`${operation} rechecks queued builds when connector edits are ${duringBuild} during rebuilding`, async () => {
                const clock = sandbox.useFakeTimers({ now: 1000, toFake: ["Date"] });
                const source = vscode.Uri.file(path.join(directory, "connector.pq"));
                fs.writeFileSync(source.fsPath, "1");
                const document = await vscode.workspace.openTextDocument(source);
                sandbox.stub(ExtensionConfigurations, "DefaultExtensionLocation").get(() => undefined);
                sandbox.stub(ExtensionConfigurations, "DefaultQueryFileLocation").get(() => "test.query.pq");
                const context = { extensionPath: directory, subscriptions: [] as vscode.Disposable[] };
                const bus = new GlobalEventBus(context as vscode.ExtensionContext);
                const output = sandbox.createStubInstance(PqSdkOutputChannel);
                const pidFile = path.join(directory, PqTestExecutableTaskQueue.ExecutablePidLockFileName);
                fs.writeFileSync(pidFile, String(process.pid));
                const queue = new PqTestExecutableTaskQueue(context as vscode.ExtensionContext, bus, output);
                const spawn = stubCli([]);
                const prompt: sinon.SinonStub = sandbox.stub(vscode.window, "showWarningMessage");
                prompt.resolves(extensionI18n["PQSdk.query.saveAndRun"]);

                if (duringBuild === "cancelled") {
                    prompt.onSecondCall().resolves(undefined);
                }

                let finishBuild: () => void = () => {};

                const buildFinished = new Promise<void>(resolve => {
                    finishBuild = resolve;
                });

                let notifyBuilding: () => void = () => {};

                const building = new Promise<void>(resolve => {
                    notifyBuilding = resolve;
                });

                const builtSources: string[] = [];

                (taskUtils.executeBuildTaskAndAwaitIfNeeded as sinon.SinonStub).callsFake(
                    async (_location: string, lastTouched: Date) => {
                        builtSources.push(fs.readFileSync(source.fsPath, "utf8"));

                        if (builtSources.length === 1) {
                            notifyBuilding();
                            await buildFinished;
                            clock.setSystemTime(3000);
                        } else {
                            assert.strictEqual(lastTouched.getTime(), 3000);
                        }
                    },
                );

                try {
                    const query =
                        operation === "run-test" ? queue.RunTestBattery("test.query.pq") : queue.TestConnection();

                    const completed = duringBuild === "cancelled" ? assert.rejects(query, /cancelled/i) : query;
                    await new Promise<void>(resolve => setImmediate(resolve));
                    assert.deepStrictEqual(builtSources, []);
                    const queuedEdit = new vscode.WorkspaceEdit();
                    queuedEdit.insert(source, new vscode.Position(0, 0), "2");
                    assert.ok(await vscode.workspace.applyEdit(queuedEdit));
                    fs.writeFileSync(pidFile, "");
                    await building;
                    assert.deepStrictEqual(builtSources, ["21"]);

                    const next = queue.ListCredentials();
                    await new Promise<void>(resolve => setImmediate(resolve));
                    assert.ok(spawn.notCalled);
                    const buildEdit = new vscode.WorkspaceEdit();
                    buildEdit.insert(source, new vscode.Position(0, 0), "3");
                    clock.setSystemTime(2000);
                    assert.ok(await vscode.workspace.applyEdit(buildEdit));

                    if (duringBuild === "saved") {
                        assert.ok(await document.save());
                    }

                    finishBuild();
                    await completed;
                    await next;

                    if (duringBuild === "cancelled") {
                        assert.strictEqual(spawn.callCount, 1);
                        assert.deepStrictEqual(builtSources, ["21"]);
                    } else {
                        assert.strictEqual(spawn.callCount, 2);
                        assert.ok(spawn.firstCall.args[1]?.includes(operation));
                        assert.deepStrictEqual(builtSources, ["21", "321"]);
                    }

                    assert.ok(spawn.lastCall.args[1]?.includes("list-credential"));
                } finally {
                    finishBuild();
                    await document.save();
                    queue.dispose();
                    bus.dispose();
                    context.subscriptions.forEach(disposable => disposable.dispose());
                }
            });
        }
    }

    for (const workingDirectory of ["explicit", "executable directory"]) {
        for (const accept of [false, true]) {
            test(`run/debug ${accept ? "saves" : "rejects"} settings parameter queries using the ${workingDirectory}`, async () => {
                const document = mockDocument({ uri: vscode.Uri.file(path.join(directory, "parameters.pq")) });

                (document.save as sinon.SinonStub).callsFake(() => {
                    sandbox.stub(document, "isDirty").get(() => false);

                    return Promise.resolve(true);
                });

                fs.writeFileSync(
                    path.join(directory, "debug.json"),
                    JSON.stringify({ ParameterQueryFilePath: "parameters.pq" }),
                );

                const prompt: sinon.SinonStub = sandbox.stub(vscode.window, "showWarningMessage");
                prompt.resolves(accept ? extensionI18n["PQSdk.query.saveAndRun"] : undefined);
                sandbox.stub(vscode.commands, "executeCommand").resolves();
                const spawn = stubCli([{ Status: "Passed", Output: [] }]);
                const task = new PqTestExecutableOnceTask();

                const exited = new Promise<void>(resolve => {
                    task.eventBus.on(PqTestExecutableOnceTaskQueueEvents.processExited, resolve);
                });

                try {
                    await task.run(path.join(directory, "launch.query.pq"), {
                        operation: "run-test",
                        workingDirectory: workingDirectory === "explicit" ? directory : undefined,
                        additionalArgs: ["--settingsFile", "debug.json"],
                    });

                    await exited;
                    assert.strictEqual(spawn.callCount, accept ? 1 : 0);
                    assert.ok(prompt.calledOnce);
                    assert.strictEqual((document.save as sinon.SinonStub).callCount, accept ? 1 : 0);

                    if (accept) {
                        assert.strictEqual(spawn.firstCall.args[2]?.cwd, directory);
                    }
                } finally {
                    task.dispose();
                }
            });
        }
    }

    test("run/debug rechecks settings parameter queries dirtied during executable readiness", async () => {
        const document = mockDocument({
            uri: vscode.Uri.file(path.join(directory, "parameters.pq")),
            isDirty: false,
        });

        fs.writeFileSync(
            path.join(directory, "debug.json"),
            JSON.stringify({ ParameterQueryFilePath: "parameters.pq" }),
        );

        const readiness = ExtensionConfigurations.getPqTestExecutablePath as sinon.SinonStub;

        readiness.callsFake(() => {
            sandbox.stub(document, "isDirty").get(() => true);

            return Promise.resolve(undefined);
        });

        sandbox.stub(vscode.window, "showWarningMessage").resolves(undefined);
        const spawn = sandbox.stub(childProcess, "spawn");
        const task = new PqTestExecutableOnceTask();

        const exited = new Promise<void>(resolve => {
            task.eventBus.on(PqTestExecutableOnceTaskQueueEvents.processExited, resolve);
        });

        try {
            await task.run(path.join(directory, "launch.query.pq"), {
                operation: "run-test",
                workingDirectory: directory,
                additionalArgs: ["--settingsFile", "debug.json"],
            });

            await exited;
            assert.ok(readiness.calledOnce);
            assert.ok(spawn.notCalled);
        } finally {
            task.dispose();
        }
    });

    test("run/debug preserves mixed query results and diagnostics for the result view", async () => {
        const result = [
            { Status: "Passed", Output: [{ Value: 42 }] },
            { Status: "Failed", Error: { Message: "Query failed" }, Details: "Failure diagnostics" },
        ];

        stubCli(result);
        const command = sandbox.stub(vscode.commands, "executeCommand").resolves();
        const task = new PqTestExecutableOnceTask();

        const exited = new Promise<void>(resolve => {
            task.eventBus.on(PqTestExecutableOnceTaskQueueEvents.processExited, resolve);
        });

        try {
            await task.run(path.join(directory, "test.query.pq"), { operation: "run-test" });
            await exited;
            assert.ok(command.calledOnce);
            assert.deepStrictEqual(command.firstCall.args[1], result);
        } finally {
            task.dispose();
        }
    });

    test("run/debug does not render operation failures as query results", async () => {
        const spawn = stubCli({ Status: "Failure", Message: "CLI command failed" });
        const command = sandbox.stub(vscode.commands, "executeCommand").resolves();
        const task = new PqTestExecutableOnceTask();

        const exited = new Promise<void>(resolve => {
            task.eventBus.on(PqTestExecutableOnceTaskQueueEvents.processExited, resolve);
        });

        try {
            await task.run(path.join(directory, "test.query.pq"), { operation: "run-test" });
            await exited;
            assert.ok(command.notCalled);
            assert.strictEqual(spawn.callCount, 1);
        } finally {
            task.dispose();
        }
    });

    test("queued commands cancel before building and reject CLI failures", async () => {
        const document = mockDocument();
        const prompt: sinon.SinonStub = sandbox.stub(vscode.window, "showWarningMessage").resolves(undefined);
        sandbox.stub(ExtensionConfigurations, "DefaultExtensionLocation").get(() => undefined);
        sandbox.stub(ExtensionConfigurations, "DefaultQueryFileLocation").get(() => path.basename(document.uri.fsPath));
        const context = { extensionPath: directory, subscriptions: [] as vscode.Disposable[] };
        const bus = new GlobalEventBus(context as vscode.ExtensionContext);
        const output = new PqSdkOutputChannel();
        const queue = new PqTestExecutableTaskQueue(context as vscode.ExtensionContext, bus, output);
        const spawn = stubCli({ Status: "Failure", Message: "CLI command failed" });

        try {
            await assert.rejects(queue.RunTestBattery(path.basename(document.uri.fsPath)), /cancelled/i);
            await assert.rejects(queue.TestConnection(), /cancelled/i);
            await assert.rejects(queue.RefreshCredential(), /cancelled/i);
            assert.ok(spawn.notCalled);
            assert.ok((taskUtils.executeBuildTaskAndAwaitIfNeeded as sinon.SinonStub).notCalled);
            prompt.resolves(extensionI18n["PQSdk.query.saveAndRun"]);
            sandbox.stub(document, "isDirty").get(() => false);
            await assert.rejects(queue.RefreshCredential(), /CLI command failed/);
            assert.strictEqual(spawn.firstCall.args[0], executable);
            spawn.resetHistory();

            (taskUtils.executeBuildTaskAndAwaitIfNeeded as sinon.SinonStub).rejects(
                new Error("Connector build failed"),
            );

            await assert.rejects(queue.RunTestBattery(document.uri.fsPath), /Connector build failed/);
            await assert.rejects(queue.TestConnection(), /Connector build failed/);
            assert.ok(spawn.notCalled);
        } finally {
            queue.dispose();
            bus.dispose();
            output.dispose();
            context.subscriptions.forEach(disposable => disposable.dispose());
        }
    });

    for (const explicitTarget of [false, true]) {
        test(`lifecycle query execution rejects an untitled ${explicitTarget ? "URI" : "active document"} before building`, async () => {
            const document = mockDocument({
                uri: vscode.Uri.parse("untitled:Untitled-1"),
                isUntitled: true,
                languageId: "powerquery",
            });

            sandbox.stub(vscode.window, "activeTextEditor").get(() => ({ document }) as vscode.TextEditor);
            sandbox.stub(ExtensionConfigurations, "DefaultExtensionLocation").get(() => undefined);
            sandbox.stub(ExtensionConfigurations, "DefaultQueryFileLocation").get(() => undefined);
            const context = { extensionPath: directory, subscriptions: [] as vscode.Disposable[] };
            const bus = new GlobalEventBus(context as vscode.ExtensionContext);
            const output = sandbox.createStubInstance(PqSdkOutputChannel);
            const queue = new PqTestExecutableTaskQueue(context as vscode.ExtensionContext, bus, output);
            const spawn = sandbox.stub(childProcess, "spawn");

            try {
                await assert.rejects(queue.RunTestBattery(explicitTarget ? document.uri : undefined), /local file/);
                assert.ok(spawn.notCalled);
                assert.ok((taskUtils.executeBuildTaskAndAwaitIfNeeded as sinon.SinonStub).notCalled);
                assert.ok((document.save as sinon.SinonStub).notCalled);
            } finally {
                queue.dispose();
                bus.dispose();
                output.dispose();
                context.subscriptions.forEach(disposable => disposable.dispose());
            }
        });
    }

    for (const save of [false, true]) {
        test(`queued queries preserve serialization when the deferred save is ${save ? "accepted" : "declined"}`, async () => {
            const document = mockDocument({ uri: vscode.Uri.file(path.join(directory, "README.md")), isDirty: false });
            let dirty = false;
            sandbox.stub(document, "isDirty").get(() => dirty);

            (document.save as sinon.SinonStub).callsFake(() => {
                dirty = false;

                return Promise.resolve(true);
            });

            sandbox.stub(ExtensionConfigurations, "DefaultExtensionLocation").get(() => undefined);

            sandbox.stub(ExtensionConfigurations, "DefaultQueryFileLocation").get(() => "test.query.pq");

            const context = { extensionPath: directory, subscriptions: [] as vscode.Disposable[] };
            const bus = new GlobalEventBus(context as vscode.ExtensionContext);
            const output = new PqSdkOutputChannel();
            const pidFile = path.join(directory, PqTestExecutableTaskQueue.ExecutablePidLockFileName);
            fs.writeFileSync(pidFile, String(process.pid));
            const queue = new PqTestExecutableTaskQueue(context as vscode.ExtensionContext, bus, output);
            const spawn = stubCli([]);
            let dismiss: (value: string | undefined) => void = () => {};
            let prompted: () => void = () => {};

            const promptShown = new Promise<void>(resolve => {
                prompted = resolve;
            });

            const prompt: sinon.SinonStub = sandbox.stub(vscode.window, "showWarningMessage");

            prompt.callsFake(() => {
                prompted();

                return new Promise<string | undefined>(resolve => {
                    dismiss = resolve;
                });
            });

            try {
                const query = queue.RefreshCredential();
                const completed = save ? query : assert.rejects(query, /cancelled/i);
                const next = queue.ListCredentials();
                await new Promise<void>(resolve => setImmediate(resolve));
                assert.ok(spawn.notCalled);
                dirty = true;
                fs.writeFileSync(pidFile, "");
                await promptShown;
                // Simulate another queue check while the save decision is pending.
                fs.writeFileSync(pidFile, "");
                await new Promise<void>(resolve => setImmediate(resolve));
                assert.ok(spawn.notCalled);

                if (save) {
                    // A foreign process acquired the shared lock during the save prompt.
                    fs.writeFileSync(pidFile, String(process.pid));
                }

                prompt.onSecondCall().resolves(extensionI18n["PQSdk.query.saveAndRun"]);
                dismiss(save ? extensionI18n["PQSdk.query.saveAndRun"] : undefined);

                if (save) {
                    await new Promise<void>(resolve => setImmediate(resolve));
                    assert.ok(spawn.notCalled);
                    fs.writeFileSync(pidFile, "");
                }

                await completed;
                assert.deepStrictEqual(await next, []);
                assert.strictEqual(spawn.callCount, save ? 2 : 1);
                assert.ok(spawn.lastCall.args[1]?.includes("list-credential"));

                if (save) {
                    assert.ok(spawn.firstCall.args[1]?.includes("refresh-credential"));
                    assert.ok((document.save as sinon.SinonStub).calledOnce);
                }
            } finally {
                dismiss(undefined);
                queue.dispose();
                bus.dispose();
                output.dispose();
                context.subscriptions.forEach(disposable => disposable.dispose());
            }
        });
    }

    for (const accept of [false, true]) {
        test(`Test Explorer ${accept ? "saves all files" : "cancels"} independently of settings casing and selected filters`, async () => {
            const settingsFile = vscode.Uri.file(path.join(directory, "batch.testsettings.json"));

            const settings = {
                queryFilePath: ".",
                parameterQueryFilePath: "parameters.pq",
                testFilters: ["selected.query.pq"],
            };

            fs.writeFileSync(settingsFile.fsPath, JSON.stringify(settings));

            const documents = [
                savedDocument("connector.pq"),
                savedDocument("parameters.pq"),
                savedDocument("excluded.query.pq"),
                savedDocument("README.md"),
            ];

            documentCollection.get(() => documents);
            const prompt: sinon.SinonStub = sandbox.stub(vscode.window, "showWarningMessage");
            prompt.resolves(accept ? extensionI18n["PQSdk.query.saveAndRun"] : undefined);
            sandbox.stub(vscode.window, "showErrorMessage").resolves(undefined);
            sandbox.stub(testSettingsUtils, "determineExtensionsForTests").resolves(undefined);
            sandbox.stub(testSettingsUtils, "buildIntermediateResultsArgs").resolves([]);

            const run = sandbox
                .stub(SpawnedProcessStreaming.prototype, "run")
                .resolves(Readable.from(['runStart:{"tests":[]}\nrunEnd:{"passed":0,"failed":0}\n']));

            const controller = vscode.tests.createTestController("cli-save-all", "CLI Save All");
            const cancellation = new vscode.CancellationTokenSource();
            const testRun = controller.createTestRun(new vscode.TestRunRequest([]));

            const executor = new TestRunExecutor(
                executable,
                settingsFile,
                testRun,
                sandbox.createStubInstance(PqSdkOutputChannel),
                cancellation.token,
            );

            executor.addTestItem(
                controller.createTestItem(
                    "selected",
                    "selected",
                    vscode.Uri.file(path.join(directory, "selected.query.pq")),
                ),
            );

            try {
                if (accept) {
                    await executor.execute(["--testFilter", "selected.query.pq"]);
                    assert.ok(run.calledOnce);
                    assert.ok(documents.every(document => !document.isDirty));
                } else {
                    await assert.rejects(executor.execute(["--testFilter", "selected.query.pq"]), /cancelled/i);
                    assert.ok(run.notCalled);
                    assert.ok(documents.every(document => (document.save as sinon.SinonStub).notCalled));
                }

                assert.ok(prompt.calledOnce);
            } finally {
                testRun.end();
                controller.dispose();
                cancellation.dispose();
            }
        });
    }

    test("Test Explorer rechecks unrelated files dirtied during asynchronous setup", async () => {
        const document = mockDocument({ uri: vscode.Uri.file(path.join(directory, "README.md")), isDirty: false });
        const settingsFile = vscode.Uri.file(path.join(directory, "batch.testsettings.json"));
        fs.writeFileSync(settingsFile.fsPath, "{}");
        sandbox.stub(testSettingsUtils, "determineExtensionsForTests").resolves(undefined);

        sandbox.stub(testSettingsUtils, "buildIntermediateResultsArgs").callsFake(() => {
            sandbox.stub(document, "isDirty").get(() => true);

            return Promise.resolve([]);
        });

        const prompt: sinon.SinonStub = sandbox.stub(vscode.window, "showWarningMessage").resolves(undefined);
        sandbox.stub(vscode.window, "showErrorMessage").resolves(undefined);
        const run = sandbox.stub(SpawnedProcessStreaming.prototype, "run");
        const controller = vscode.tests.createTestController("cli-save-all-setup", "CLI Save All setup");
        const cancellation = new vscode.CancellationTokenSource();
        const testRun = controller.createTestRun(new vscode.TestRunRequest([]));

        const executor = new TestRunExecutor(
            executable,
            settingsFile,
            testRun,
            sandbox.createStubInstance(PqSdkOutputChannel),
            cancellation.token,
        );

        try {
            await assert.rejects(executor.execute(), /cancelled/i);
            assert.ok(prompt.calledOnce);
            assert.ok(run.notCalled);
        } finally {
            testRun.end();
            controller.dispose();
            cancellation.dispose();
        }
    });

    for (const stage of ["extensions", "intermediate results"]) {
        for (const saveDuringSetup of [false, true]) {
            test(`Test Explorer recomputes arguments after settings are ${saveDuringSetup ? "saved" : "dirtied"} during ${stage} setup`, async () => {
                const settingsFile = vscode.Uri.file(path.join(directory, "batch.testsettings.json"));
                fs.writeFileSync(settingsFile.fsPath, JSON.stringify({ IntermediateTestResultsFolder: "old-results" }));
                const document = await vscode.workspace.openTextDocument(settingsFile);
                sandbox.stub(ExtensionConfigurations, "TestExtensionPaths").get(() => "old.mez");
                chooseSave();
                let edited = false;

                const editSettings = async (): Promise<void> => {
                    if (edited) {
                        return;
                    }

                    edited = true;
                    const edit = new vscode.WorkspaceEdit();

                    edit.replace(
                        settingsFile,
                        new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)),
                        JSON.stringify({
                            ExtensionPaths: ["new.mez"],
                            IntermediateTestResultsFolder: "new-results",
                        }),
                    );

                    assert.ok(await vscode.workspace.applyEdit(edit));

                    if (saveDuringSetup) {
                        assert.ok(await document.save());
                    }
                };

                const determineExtensions = testSettingsUtils.determineExtensionsForTests;

                const determine = sandbox
                    .stub(testSettingsUtils, "determineExtensionsForTests")
                    .callsFake(async (...args) => {
                        const result = await determineExtensions(...args);

                        if (stage === "extensions") {
                            await editSettings();
                        }

                        return result;
                    });

                const buildArgs = testSettingsUtils.buildIntermediateResultsArgs;

                const intermediate = sandbox
                    .stub(testSettingsUtils, "buildIntermediateResultsArgs")
                    .callsFake(async (...args) => {
                        const result = await buildArgs(...args);

                        if (stage === "intermediate results") {
                            await editSettings();
                        }

                        return result;
                    });

                const originalSpawn = childProcess.spawn.bind(childProcess);
                const spawn = sandbox.stub(childProcess, "spawn").callThrough().withArgs(executable);

                spawn.callsFake(() =>
                    originalSpawn(
                        process.execPath,
                        ["-e", 'process.stdout.write(\'runStart:{"tests":[]}\\nrunEnd:{"passed":0,"failed":0}\\n\');'],
                        { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } },
                    ),
                );

                const controller = vscode.tests.createTestController("cli-stable-settings", "CLI stable settings");
                const cancellation = new vscode.CancellationTokenSource();
                const testRun = controller.createTestRun(new vscode.TestRunRequest([]));

                const executor = new TestRunExecutor(
                    executable,
                    settingsFile,
                    testRun,
                    sandbox.createStubInstance(PqSdkOutputChannel),
                    cancellation.token,
                );

                try {
                    await executor.execute(["--testFilter", "selected.query.pq"]);
                    assert.ok(spawn.calledOnce);
                    const args: readonly string[] = spawn.firstCall.args[1];
                    assert.ok(!args.includes("--extension"));
                    assert.ok(!args.includes("old.mez"));
                    assert.strictEqual(args[args.indexOf("--intermediateTestResultsFolder") + 1], "new-results");
                    assert.strictEqual(args[args.indexOf("--testFilter") + 1], "selected.query.pq");
                    assert.strictEqual(determine.callCount, 2);
                    assert.strictEqual(intermediate.callCount, 2);
                    assert.ok(!document.isDirty);
                } finally {
                    await document.save();
                    testRun.end();
                    controller.dispose();
                    cancellation.dispose();
                }
            });
        }
    }

    test("localized Save All prompts do not require a queryFile substitution", () => {
        const localesDirectory = path.resolve(__dirname, "..", "..", "..", "..", "localize", "i18n");
        const locales = fs.readdirSync(localesDirectory);

        assert.ok(locales.length > 0);

        for (const locale of locales) {
            const translations: Record<string, string> = JSON.parse(
                fs.readFileSync(path.join(localesDirectory, locale, "extension.json"), "utf8"),
            );

            for (const key of ["saveAndRun", "saveRequired", "executionCancelled"]) {
                const value = translations[`PQSdk.query.${key}`];
                assert.ok(value, `${locale}: missing ${key}`);
                assert.ok(!value.includes("{"), `${locale}: ${key} still requires substitution`);
            }
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
            "",
        );
    });
});

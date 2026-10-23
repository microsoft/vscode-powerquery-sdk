/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

/* global setup, teardown */

import * as assert from "assert";
import * as sinon from "sinon";
import { setImmediate } from "timers";
import * as vscode from "vscode";

import { ExtensionConfigurations } from "../../constants/PowerQuerySdkConfiguration";
import { PqSdkOutputChannel } from "../../features/PqSdkOutputChannel";
import { resolveTestItem } from "../../testing/pqtest-adapter/TestResolver";
import { TestWatcherManager } from "../../testing/pqtest-adapter/TestWatcherManager";
import {
    getTestSettingsExcludePattern,
    isTestSettingsExcluded,
} from "../../testing/pqtest-adapter/utils/testSettingsExclusions";
import { getTestPathFromSettings, getTestSettingsFileUris } from "../../testing/pqtest-adapter/utils/testSettingsUtils";
import * as vscodeFs from "../../testing/pqtest-adapter/utils/vscodeFs";

suite("Test settings discovery", () => {
    let sandbox: sinon.SinonSandbox;
    let output: PqSdkOutputChannel;
    let root: vscode.Uri;
    let settings: string | string[] | undefined;
    let filesExclude: Record<string, boolean | { when: string }>;
    let searchExclude: Record<string, boolean | { when: string }>;
    let stat: sinon.SinonStub;
    let readFile: sinon.SinonStub;
    let findFiles: sinon.SinonStub;
    let showError: sinon.SinonStub;
    let showWarning: sinon.SinonStub;
    let controller: vscode.TestController;
    let manager: TestWatcherManager | undefined;
    let configurationChanged: vscode.EventEmitter<vscode.ConfigurationChangeEvent>;

    let watchers: Array<{
        pattern: vscode.GlobPattern;
        created: vscode.EventEmitter<vscode.Uri>;
        deleted: vscode.EventEmitter<vscode.Uri>;
        dispose: sinon.SinonSpy;
        listenerDisposed: sinon.SinonSpy;
    }>;

    setup(() => {
        sandbox = sinon.createSandbox();
        root = vscode.workspace.workspaceFolders![0].uri;
        settings = undefined;
        filesExclude = {};
        searchExclude = {};
        watchers = [];
        output = sandbox.createStubInstance(PqSdkOutputChannel);
        sandbox.stub(ExtensionConfigurations, "testSettingsFiles").get(() => settings);

        const getConfiguration: typeof vscode.workspace.getConfiguration = vscode.workspace.getConfiguration;

        sandbox.stub(vscode.workspace, "getConfiguration").callsFake((section, scope) => {
            const config: vscode.WorkspaceConfiguration = getConfiguration(section, scope);

            if (section === "files" || section === "search") {
                return {
                    ...config,
                    get: sandbox.stub().returns(section === "files" ? filesExclude : searchExclude),
                };
            }

            return config;
        });

        stat = sandbox.stub().resolves({
            type: vscode.FileType.File,
            ctime: 0,
            mtime: 0,
            size: 0,
        });

        readFile = sandbox.stub();
        const fs: vscode.FileSystem = { ...vscode.workspace.fs, stat, readFile };
        sandbox.stub(vscode.workspace, "fs").value(fs);
        sandbox.stub(vscodeFs, "defaultFileSystemOperations").value(fs);
        findFiles = sandbox.stub(vscode.workspace, "findFiles").resolves([]);
        showError = sandbox.stub(vscode.window, "showErrorMessage").resolves(undefined);
        showWarning = sandbox.stub(vscode.window, "showWarningMessage").resolves(undefined);
        controller = vscode.tests.createTestController("settings-discovery-regression", "Settings discovery");
        configurationChanged = new vscode.EventEmitter<vscode.ConfigurationChangeEvent>();
        sandbox.stub(vscode.workspace, "onDidChangeConfiguration").callsFake(configurationChanged.event);

        sandbox.stub(vscode.workspace, "createFileSystemWatcher").callsFake(pattern => {
            const created: vscode.EventEmitter<vscode.Uri> = new vscode.EventEmitter<vscode.Uri>();
            const changed: vscode.EventEmitter<vscode.Uri> = new vscode.EventEmitter<vscode.Uri>();
            const deleted: vscode.EventEmitter<vscode.Uri> = new vscode.EventEmitter<vscode.Uri>();
            const listenerDisposed: sinon.SinonSpy = sandbox.spy();

            function trackListeners(event: vscode.Event<vscode.Uri>): vscode.Event<vscode.Uri> {
                return (
                    listener: (event: vscode.Uri) => unknown,
                    thisArgs?: unknown,
                    disposables?: vscode.Disposable[],
                ) => {
                    const registration: vscode.Disposable = event(listener, thisArgs);

                    const disposable: vscode.Disposable = new vscode.Disposable(() => {
                        registration.dispose();
                        listenerDisposed();
                    });

                    disposables?.push(disposable);

                    return disposable;
                };
            }

            const dispose: sinon.SinonSpy = sandbox.spy(() => {
                created.dispose();
                changed.dispose();
                deleted.dispose();
            });

            watchers.push({ pattern, created, deleted, dispose, listenerDisposed });

            return {
                ignoreCreateEvents: false,
                ignoreChangeEvents: false,
                ignoreDeleteEvents: false,
                onDidCreate: trackListeners(created.event),
                onDidChange: trackListeners(changed.event),
                onDidDelete: trackListeners(deleted.event),
                dispose,
            };
        });
    });

    teardown(() => {
        manager?.dispose();
        manager = undefined;
        controller?.dispose();
        configurationChanged?.dispose();
        output.dispose();
        sandbox.restore();
    });

    function uri(relativePath: string): vscode.Uri {
        return vscode.Uri.joinPath(root, relativePath);
    }

    function directoryStat(): void {
        stat.resolves({ type: vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 });
    }

    test("no configuration performs no search or filesystem watch and shows no notifications", async () => {
        manager = new TestWatcherManager(controller, output);
        await manager.initialize();

        assert.strictEqual(findFiles.callCount, 0);
        assert.strictEqual(stat.callCount, 0);
        assert.strictEqual(watchers.length, 0);
        assert.strictEqual(showError.callCount, 0);
        assert.strictEqual(showWarning.callCount, 0);
    });

    test("empty configuration performs no search", async () => {
        settings = [];
        assert.deepStrictEqual(await getTestSettingsFileUris(output), []);
        assert.strictEqual(findFiles.callCount, 0);
    });

    test("no workspace performs no discovery or watching", async () => {
        sandbox.stub(vscode.workspace, "workspaceFolders").value(undefined);
        settings = uri("tests").fsPath;
        manager = new TestWatcherManager(controller, output);
        await manager.initialize();

        assert.strictEqual(findFiles.callCount, 0);
        assert.strictEqual(stat.callCount, 0);
        assert.strictEqual(watchers.length, 0);
        assert.strictEqual(showError.callCount, 0);
    });

    test("explicit files are used without recursive discovery and duplicate paths are removed", async () => {
        const file: vscode.Uri = uri("tests/sample.testsettings.json");
        settings = [file.fsPath, file.fsPath];

        assert.deepStrictEqual(
            (await getTestSettingsFileUris(output)).map((fileUri: vscode.Uri) => fileUri.fsPath),
            [file.fsPath],
        );

        assert.strictEqual(findFiles.callCount, 0);
        assert.strictEqual(stat.callCount, 1);
    });

    test("directory discovery is scoped, excludes workspace-relative paths, and deduplicates results", async () => {
        const directory: vscode.Uri = uri("tests");
        const included: vscode.Uri = uri("tests/sample.testsettings.json");
        const excluded: vscode.Uri = uri("tests/generated/sample.testsettings.json");
        settings = [directory.fsPath, included.fsPath];
        filesExclude = { "tests/generated": true };
        searchExclude = { "**/cache/**": true };
        directoryStat();
        findFiles.resolves([included, excluded]);

        stat.withArgs(sinon.match((fileUri: vscode.Uri) => fileUri.fsPath === included.fsPath)).resolves({
            type: vscode.FileType.File,
            ctime: 0,
            mtime: 0,
            size: 0,
        });

        assert.deepStrictEqual(
            (await getTestSettingsFileUris(output)).map((fileUri: vscode.Uri) => fileUri.fsPath),
            [included.fsPath],
        );

        assert.strictEqual(findFiles.callCount, 1);

        const include: vscode.RelativePattern = findFiles.firstCall.args[0];
        const exclude: vscode.RelativePattern = findFiles.firstCall.args[1];
        assert.strictEqual(include.baseUri.fsPath, directory.fsPath);
        assert.strictEqual(include.pattern, "**/*.testsettings.json");
        assert.strictEqual(exclude.baseUri.toString(), root.toString());
        assert.ok(exclude.pattern.includes("tests/generated/**"));
        assert.ok(exclude.pattern.includes("**/cache/**"));
    });

    test("search exclusions can disable a files exclusion and dot directories are excluded", async () => {
        filesExclude = { "**/generated": true, "**/.cache": true };
        searchExclude = { "**/generated": false };

        assert.strictEqual(await isTestSettingsExcluded(uri("tests/generated/sample.testsettings.json")), false);
        assert.strictEqual(await isTestSettingsExcluded(uri("tests/.cache/sample.testsettings.json")), true);
    });

    test("conditional exclusions check a sibling without excluding unrelated settings", async () => {
        filesExclude = { "**/*.testsettings.json": { when: "$(basename).pq" } };
        const sibling: vscode.Uri = uri("tests/sample.testsettings.pq");
        stat.rejects(vscode.FileSystemError.FileNotFound());

        stat.withArgs(sinon.match((fileUri: vscode.Uri) => fileUri.fsPath === sibling.fsPath)).resolves({
            type: vscode.FileType.File,
            ctime: 0,
            mtime: 0,
            size: 0,
        });

        assert.strictEqual(getTestSettingsExcludePattern(uri("tests")), null);
        assert.strictEqual(await isTestSettingsExcluded(uri("tests/sample.testsettings.json")), true);
        assert.strictEqual(await isTestSettingsExcluded(uri("tests/other.testsettings.json")), false);
    });

    test("exclusions beginning with a hash are literal patterns, not comments", async () => {
        filesExclude = { "#generated": true };

        assert.strictEqual(await isTestSettingsExcluded(uri("#generated/sample.testsettings.json")), true);
        assert.strictEqual(await isTestSettingsExcluded(uri("tests/sample.testsettings.json")), false);
    });

    test("missing paths and incorrect extensions only log diagnostics", async () => {
        settings = [uri("missing.testsettings.json").fsPath, uri("not-settings.json").fsPath];
        stat.onFirstCall().rejects(vscode.FileSystemError.FileNotFound());

        assert.deepStrictEqual(await getTestSettingsFileUris(output), []);
        assert.strictEqual(showError.callCount, 0);
        assert.strictEqual(showWarning.callCount, 0);
        assert.strictEqual(findFiles.callCount, 0);
        sinon.assert.calledTwice(output.appendDebugLine as sinon.SinonStub);
    });

    test("directory create events honor exclusions without rediscovery and ignore duplicate creates", async () => {
        settings = uri("tests").fsPath;
        directoryStat();
        filesExclude = { "tests/generated": true };
        manager = new TestWatcherManager(controller, output);
        await manager.initialize();

        assert.strictEqual(watchers.length, 1);
        const directoryWatcher: (typeof watchers)[number] = watchers[0];
        const included: vscode.Uri = uri("tests/new.testsettings.json");
        directoryWatcher.created.fire(uri("tests/generated/ignored.testsettings.json"));
        directoryWatcher.created.fire(included);
        await new Promise<void>(resolve => setImmediate(resolve));

        assert.strictEqual(controller.items.size, 1);
        assert.strictEqual(watchers.length, 2);
        assert.strictEqual(findFiles.callCount, 1);

        directoryWatcher.created.fire(included);
        await new Promise<void>(resolve => setImmediate(resolve));
        assert.strictEqual(watchers.length, 2);
        assert.strictEqual(controller.items.size, 1);
        directoryWatcher.deleted.fire(included);
        assert.strictEqual(controller.items.size, 0);
        assert.strictEqual(showError.callCount, 0);
    });

    test("explicit file watchers are scoped to the configured path", async () => {
        const file: vscode.Uri = uri("tests/sample.testsettings.json");
        settings = file.fsPath;
        manager = new TestWatcherManager(controller, output);
        await manager.initialize();

        assert.strictEqual(watchers.length, 1);
        const pattern: vscode.RelativePattern = watchers[0].pattern as vscode.RelativePattern;
        assert.strictEqual(pattern.baseUri.toString(), root.toString());
        assert.ok(!pattern.pattern.includes("*"));
        assert.strictEqual(findFiles.callCount, 0);
    });

    test("explicit settings files bypass directory exclusions when recreated", async () => {
        const directory: vscode.Uri = uri("tests");
        const file: vscode.Uri = uri("tests/generated/sample.testsettings.json");
        settings = [directory.fsPath, file.fsPath];
        filesExclude = { "tests/generated": true };
        directoryStat();

        stat.withArgs(sinon.match((fileUri: vscode.Uri) => fileUri.fsPath === file.fsPath)).resolves({
            type: vscode.FileType.File,
            ctime: 0,
            mtime: 0,
            size: 0,
        });

        manager = new TestWatcherManager(controller, output);
        await manager.initialize();

        assert.strictEqual(controller.items.size, 1);
        const directoryWatcher: (typeof watchers)[number] = watchers[1];
        directoryWatcher.deleted.fire(file);
        assert.strictEqual(controller.items.size, 0);
        directoryWatcher.created.fire(file);
        await new Promise<void>(resolve => setImmediate(resolve));

        assert.strictEqual(controller.items.size, 1);
        assert.strictEqual(watchers.length, 3);
        assert.strictEqual(watchers[0].dispose.callCount, 1);
        assert.strictEqual(findFiles.callCount, 1);
    });

    for (const source of ["explicit files", "directory and explicit file"]) {
        (process.platform === "win32" ? test : test.skip)(
            `case-equivalent ${source} do not leak Windows file watchers`,
            async () => {
                const file: vscode.Uri = uri("tests/Sample.testsettings.json");
                const alias: vscode.Uri = uri("tests/sample.testsettings.json");
                settings = [file.fsPath, alias.fsPath];

                if (source === "directory and explicit file") {
                    settings = [uri("tests").fsPath, alias.fsPath];
                    directoryStat();
                    findFiles.resolves([file]);

                    stat.withArgs(sinon.match((fileUri: vscode.Uri) => fileUri.fsPath === alias.fsPath)).resolves({
                        type: vscode.FileType.File,
                        ctime: 0,
                        mtime: 0,
                        size: 0,
                    });
                }

                manager = new TestWatcherManager(controller, output);
                await manager.initialize();
                const watchersPerGeneration: number = source === "explicit files" ? 1 : 2;
                assert.strictEqual(watchers.length, watchersPerGeneration);

                configurationChanged.fire({ affectsConfiguration: (key: string) => key === "search.exclude" });
                await new Promise<void>(resolve => setImmediate(resolve));

                assert.strictEqual(watchers.length, watchersPerGeneration * 2);

                for (const watcher of watchers.slice(0, watchersPerGeneration)) {
                    assert.strictEqual(watcher.dispose.callCount, 1);
                    assert.strictEqual(watcher.listenerDisposed.callCount, 2);
                }

                manager.dispose();

                for (const watcher of watchers) {
                    assert.strictEqual(watcher.dispose.callCount, 1);
                    assert.strictEqual(watcher.listenerDisposed.callCount, 2);
                }
            },
        );
    }

    test("directory deletion cancels an in-flight create instead of adding a stale item", async () => {
        settings = uri("tests").fsPath;
        directoryStat();
        manager = new TestWatcherManager(controller, output);
        await manager.initialize();

        const file: vscode.Uri = uri("tests/transient.testsettings.json");
        watchers[0].created.fire(file);
        watchers[0].deleted.fire(file);
        await new Promise<void>(resolve => setImmediate(resolve));

        assert.strictEqual(controller.items.size, 0);
        assert.strictEqual(watchers.length, 1);
    });

    for (const deletionSource of ["file", "directory"]) {
        test(`${deletionSource} deletion disposes the file watcher and its listeners immediately`, async () => {
            settings = uri("tests").fsPath;
            directoryStat();
            manager = new TestWatcherManager(controller, output);
            await manager.initialize();

            const file: vscode.Uri = uri("tests/transient.testsettings.json");
            const directoryWatcher: (typeof watchers)[number] = watchers[0];
            directoryWatcher.created.fire(file);
            await new Promise<void>(resolve => setImmediate(resolve));
            const fileWatcher: (typeof watchers)[number] = watchers[1];

            (deletionSource === "file" ? fileWatcher : directoryWatcher).deleted.fire(file);

            assert.strictEqual(controller.items.size, 0);
            assert.strictEqual(fileWatcher.dispose.callCount, 1);
            assert.strictEqual(fileWatcher.listenerDisposed.callCount, 2);

            manager.dispose();
            assert.strictEqual(fileWatcher.dispose.callCount, 1);
            assert.strictEqual(fileWatcher.listenerDisposed.callCount, 2);
        });
    }

    test("exclusion changes reset discovery and dispose previous watchers", async () => {
        settings = [uri("tests").fsPath, uri("tests").fsPath];
        directoryStat();
        manager = new TestWatcherManager(controller, output);
        await manager.initialize();
        assert.strictEqual(watchers.length, 1);

        configurationChanged.fire({ affectsConfiguration: (key: string) => key === "search.exclude" });
        await new Promise<void>(resolve => setImmediate(resolve));

        assert.strictEqual(findFiles.callCount, 2);
        assert.strictEqual(watchers.length, 2);
        assert.strictEqual(watchers[0].dispose.callCount, 1);
        assert.strictEqual(watchers[1].dispose.callCount, 0);
    });

    test("in-flight directory events do not add tests or watchers after disposal", async () => {
        settings = uri("tests").fsPath;
        directoryStat();
        manager = new TestWatcherManager(controller, output);
        await manager.initialize();

        watchers[0].created.fire(uri("tests/new.testsettings.json"));
        manager.dispose();
        await new Promise<void>(resolve => setImmediate(resolve));

        assert.strictEqual(controller.items.size, 0);
        assert.strictEqual(watchers.length, 1);
    });

    test("in-flight discovery does not install watchers after disposal", async () => {
        settings = uri("tests").fsPath;
        directoryStat();
        manager = new TestWatcherManager(controller, output);
        const initialization: Promise<void> = manager.initialize();
        manager.dispose();
        await initialization;

        assert.strictEqual(controller.items.size, 0);
        assert.strictEqual(watchers.length, 0);
    });

    test("real directory search prunes excluded subdirectories within its configured scope", async () => {
        const directory: vscode.Uri = uri("scoped-settings-regression");
        const nested: vscode.Uri = vscode.Uri.joinPath(directory, "nested");
        const generated: vscode.Uri = vscode.Uri.joinPath(directory, "generated");
        settings = directory.fsPath;
        filesExclude = { "scoped-settings-regression/generated": true };
        directoryStat();
        findFiles.restore();

        try {
            await vscode.workspace.fs.createDirectory(nested);
            await vscode.workspace.fs.createDirectory(generated);

            await Promise.all([
                vscode.workspace.fs.writeFile(
                    vscode.Uri.joinPath(nested, "included.testsettings.json"),
                    Buffer.from("{}"),
                ),
                vscode.workspace.fs.writeFile(
                    vscode.Uri.joinPath(generated, "excluded.testsettings.json"),
                    Buffer.from("{}"),
                ),
            ]);

            const result: vscode.Uri[] = await getTestSettingsFileUris(output);

            assert.deepStrictEqual(
                result.map((fileUri: vscode.Uri) => fileUri.fsPath),
                [vscode.Uri.joinPath(nested, "included.testsettings.json").fsPath],
            );
        } finally {
            await vscode.workspace.fs.delete(directory, { recursive: true });
        }
    });

    test("malformed settings retain Test Explorer errors without notifications", async () => {
        readFile.resolves(Buffer.from("null"));

        const item: vscode.TestItem = controller.createTestItem(
            "malformed-settings",
            "Malformed",
            uri("sample.testsettings.json"),
        );

        await resolveTestItem(item, controller, output);

        assert.ok(item.error);
        assert.strictEqual(showError.callCount, 0);
        sinon.assert.calledOnce(output.appendDebugLine as sinon.SinonStub);
    });

    test("unreadable settings reject with diagnostics and no popup", async () => {
        readFile.rejects(vscode.FileSystemError.FileNotFound());

        await assert.rejects(
            getTestPathFromSettings(uri("missing.testsettings.json").fsPath, undefined, undefined, output),
        );

        assert.strictEqual(showError.callCount, 0);
        sinon.assert.calledOnce(output.appendDebugLine as sinon.SinonStub);
    });

    test("missing query paths reject with diagnostics and no popup", async () => {
        readFile.resolves(Buffer.from('{"QueryFilePath":"missing"}'));
        stat.rejects(vscode.FileSystemError.FileNotFound());

        await assert.rejects(
            getTestPathFromSettings(uri("sample.testsettings.json").fsPath, undefined, undefined, output),
        );

        assert.strictEqual(showError.callCount, 0);
        sinon.assert.calledOnce(output.appendDebugLine as sinon.SinonStub);
    });

    test("query paths with incorrect file extensions reject without a popup", async () => {
        readFile.resolves(Buffer.from('{"QueryFilePath":"not-a-query.txt"}'));

        await assert.rejects(
            getTestPathFromSettings(uri("sample.testsettings.json").fsPath, undefined, undefined, output),
        );

        assert.strictEqual(showError.callCount, 0);
        sinon.assert.calledOnce(output.appendDebugLine as sinon.SinonStub);
    });

    for (const text of [
        "{",
        "null",
        "[]",
        "42",
        "{}",
        '{"QueryFilePath": null}',
        '{"QueryFilePath": 42}',
        '{"QueryFilePath": "   "}',
    ]) {
        test(`invalid settings ${text} reject with diagnostics and no popup`, async () => {
            readFile.resolves(Buffer.from(text));

            await assert.rejects(
                getTestPathFromSettings(uri("sample.testsettings.json").fsPath, undefined, undefined, output),
            );

            assert.strictEqual(showError.callCount, 0);
            assert.strictEqual(showWarning.callCount, 0);
            sinon.assert.calledOnce(output.appendDebugLine as sinon.SinonStub);
        });
    }

    test("valid settings resolve paths relative to the settings file", async () => {
        readFile.resolves(Buffer.from('{"QueryFilePath":"queries"}'));
        directoryStat();

        assert.strictEqual(
            await getTestPathFromSettings(uri("tests/sample.testsettings.json").fsPath, undefined, undefined, output),
            uri("tests/queries").fsPath,
        );

        assert.strictEqual(showError.callCount, 0);
    });
});

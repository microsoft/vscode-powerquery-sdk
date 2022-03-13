// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { GlobalEventBus } from "GlobalEventBus";
import { IDisposable } from "common/Disposable";
import { LifecycleCommands } from "commands/LifecycleCommands";
import { PqSdkOutputChannel } from "features/PqSdkOutputChannel";
import { PowerQueryTaskProvider } from "features/PowerQueryTaskProvider";
import { LifeCycleTaskTreeView } from "features/LifeCycleTaskTreeView";
import { PqTestResultViewPanel } from "panels/PqTestResultViewPanel";
import { PqTestExecutableTaskQueue } from "pqTestConnector/PqTestExecutableTaskQueue";

export function activate(vscExtCtx: vscode.ExtensionContext) {
    // let's make extension::activate server as minimum as possible:
    // for now:
    //          it basically does the Dependency Injection,
    //          which could be replaced by *inversify* if we later really need to
    const globalEventBus: GlobalEventBus = new GlobalEventBus(vscExtCtx);
    const pqTestResultViewPanelDisposable: IDisposable = PqTestResultViewPanel.activate(vscExtCtx);
    const pqSdkOutputChannel: PqSdkOutputChannel = new PqSdkOutputChannel();
    const pqTestExecutableTaskQueue: PqTestExecutableTaskQueue = new PqTestExecutableTaskQueue(
        vscExtCtx,
        globalEventBus,
        pqSdkOutputChannel,
    );

    const pqTaskProvider: IDisposable = vscode.tasks.registerTaskProvider(
        PowerQueryTaskProvider.TaskType,
        new PowerQueryTaskProvider(pqTestExecutableTaskQueue),
    );

    // okay, LifecycleCommands instance has not become a disposable yet
    new LifecycleCommands(vscExtCtx, pqTestExecutableTaskQueue, pqSdkOutputChannel);

    const lifeCycleTaskTreeViewDataProvider: LifeCycleTaskTreeView = new LifeCycleTaskTreeView(globalEventBus);

    const lifeCycleTaskTreeView: IDisposable = vscode.window.createTreeView(LifeCycleTaskTreeView.TreeViewName, {
        treeDataProvider: lifeCycleTaskTreeViewDataProvider,
    });

    vscExtCtx.subscriptions.push(
        ...[
            globalEventBus,
            pqTestResultViewPanelDisposable,
            pqSdkOutputChannel,
            pqTestExecutableTaskQueue,
            pqTaskProvider,
            lifeCycleTaskTreeView,
        ].reverse(),
    );
}

// we need not explicitly invoke deactivate callbacks for now
// vscExtCtx.subscriptions would help us do that
// export function deactivate(): void {
//     // noop
// }

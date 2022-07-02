/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as vscode from "vscode";
import { activateExternalConfiguration } from "constants/PowerQuerySdkConfiguration";
import { activateMQueryDebug } from "debugAdaptor/activateMQueryDebug";
import { GlobalEventBus } from "GlobalEventBus";
import { IDisposable } from "common/Disposable";
import { LifecycleCommands } from "commands/LifecycleCommands";
import { LifeCycleTaskTreeView } from "features/LifeCycleTaskTreeView";
import { PowerQueryTaskProvider } from "features/PowerQueryTaskProvider";
import { PqSdkOutputChannel } from "features/PqSdkOutputChannel";
import { PqTestExecutableTaskQueue } from "pqTestConnector/PqTestExecutableTaskQueue";
import { PqTestResultViewPanel } from "panels/PqTestResultViewPanel";

export function activate(vscExtCtx: vscode.ExtensionContext): void {
    activateExternalConfiguration(true);
    // let's make extension::activate serves as minimum as possible:
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

    // lifecycleCommands instance has not been a disposable yet
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

    activateMQueryDebug(vscExtCtx, "server");
}

// we need not explicitly invoke deactivate callbacks for now
// vscExtCtx.subscriptions would help us do that
// export function deactivate(): void {
//     // noop
// }

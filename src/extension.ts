/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as vscode from "vscode";

import { convertExtensionInfoToLibraryJson, ExtensionInfo } from "common/PQTestService";
import { getFirstWorkspaceFolder, openDefaultPqFileIfNeeded } from "utils/vscodes";
import { activateExternalConfiguration } from "constants/PowerQuerySdkConfiguration";
import { activateMQueryDebug } from "debugAdaptor/activateMQueryDebug";
import { GlobalEventBus } from "GlobalEventBus";
import { IDisposable } from "common/Disposable";
import { LifecycleCommands } from "commands/LifecycleCommands";
import { LifeCycleTaskTreeView } from "features/LifeCycleTaskTreeView";
import { NugetHttpService } from "common/NugetHttpService";
import { PowerQueryTaskProvider } from "features/PowerQueryTaskProvider";
import { PqSdkOutputChannel } from "features/PqSdkOutputChannel";
import { PqTestExecutableTaskQueue } from "pqTestConnector/PqTestExecutableTaskQueue";
import { PqTestResultViewPanel } from "panels/PqTestResultViewPanel";

export function activate(vscExtCtx: vscode.ExtensionContext): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vscPowerQuery: any = vscode.extensions.getExtension("powerquery.vscode-powerquery")?.exports;

    const nugetHttpService: NugetHttpService = new NugetHttpService();

    activateExternalConfiguration();
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

    pqTestExecutableTaskQueue.currentExtensionInfos.subscribe((infos: ExtensionInfo[]) => {
        const theUri: vscode.Uri | undefined = getFirstWorkspaceFolder()?.uri;

        if (theUri) {
            vscPowerQuery.onModuleLibraryUpdated(theUri.toString(), convertExtensionInfoToLibraryJson(infos));
        }
    });

    if (pqTestExecutableTaskQueue.currentExtensionInfos.value.length) {
        pqTestExecutableTaskQueue.currentExtensionInfos.emit();
    }

    const pqTaskProvider: IDisposable = vscode.tasks.registerTaskProvider(
        PowerQueryTaskProvider.TaskType,
        new PowerQueryTaskProvider(pqTestExecutableTaskQueue),
    );

    // lifecycleCommands instance has not been a disposable yet
    new LifecycleCommands(vscExtCtx, globalEventBus, nugetHttpService, pqTestExecutableTaskQueue, pqSdkOutputChannel);

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

    openDefaultPqFileIfNeeded();
}

// we need not explicitly invoke deactivate callbacks for now
// vscExtCtx.subscriptions would help us do that
// export function deactivate(): void {
//     // noop
// }

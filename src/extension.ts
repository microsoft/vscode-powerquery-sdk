/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as vscode from "vscode";

import { convertExtensionInfoToLibraryJson, ExtensionInfo, IPQTestService } from "./common/PQTestService";
import { getFirstWorkspaceFolder, maybeHandleNewWorkspaceCreated } from "./utils/vscodes";
import { activateMQueryDebug } from "./debugAdaptor/activateMQueryDebug";
import { ExtensionConfigurations } from "./constants/PowerQuerySdkConfiguration";
import { extensionI18n } from "./i18n/extension";
import { GlobalEventBus } from "./GlobalEventBus";
import { IDisposable } from "./common/Disposable";
import { isSupportedOs } from "./utils/osUtils";
import { LifecycleCommands } from "./commands/LifecycleCommands";
import { LifeCycleTaskTreeView } from "./features/LifeCycleTaskTreeView";
import { NugetHttpService } from "./common/NugetHttpService";
import { PowerQueryTaskProvider } from "./features/PowerQueryTaskProvider";
import { PqSdkOutputChannel } from "./features/PqSdkOutputChannel";
import { PqServiceHostClient } from "./pqTestConnector/PqServiceHostClient";
import { PqTestExecutableTaskQueue } from "./pqTestConnector/PqTestExecutableTaskQueue";
import { PqTestResultViewPanel } from "./panels/PqTestResultViewPanel";

export function activate(vscExtCtx: vscode.ExtensionContext): void {
    if (isSupportedOs()) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vscPowerQuery: any = vscode.extensions.getExtension("powerquery.vscode-powerquery")?.exports;

        const useServiceHost: boolean = ExtensionConfigurations.featureUseServiceHost;

        // let's make extension::activate serves as minimum as possible:
        // for now:
        //          it basically does the Dependency Injection,
        //          which could be replaced by *inversify* if we later really need to
        const globalEventBus: GlobalEventBus = new GlobalEventBus(vscExtCtx);
        const pqTestResultViewPanelDisposable: IDisposable = PqTestResultViewPanel.activate(vscExtCtx);
        const pqSdkOutputChannel: PqSdkOutputChannel = new PqSdkOutputChannel();
        const nugetHttpService: NugetHttpService = new NugetHttpService(globalEventBus, pqSdkOutputChannel);

        const disposablePqTestServices: IPQTestService & IDisposable = useServiceHost
            ? new PqServiceHostClient(globalEventBus, pqSdkOutputChannel)
            : new PqTestExecutableTaskQueue(vscExtCtx, globalEventBus, pqSdkOutputChannel);

        disposablePqTestServices.currentExtensionInfos.subscribe((infos: ExtensionInfo[]) => {
            const theUri: vscode.Uri | undefined = getFirstWorkspaceFolder()?.uri;

            if (theUri) {
                vscPowerQuery.onModuleLibraryUpdated(theUri.toString(), convertExtensionInfoToLibraryJson(infos));
            }
        });

        if (disposablePqTestServices.currentExtensionInfos.value.length) {
            disposablePqTestServices.currentExtensionInfos.emit();
        }

        const pqTaskProvider: IDisposable = vscode.tasks.registerTaskProvider(
            PowerQueryTaskProvider.TaskType,
            new PowerQueryTaskProvider(disposablePqTestServices),
        );

        // lifecycleCommands instance has not been a disposable yet
        const lifecycleCommands: LifecycleCommands = new LifecycleCommands(
            vscExtCtx,
            globalEventBus,
            nugetHttpService,
            disposablePqTestServices,
            pqSdkOutputChannel,
        );

        const lifeCycleTaskTreeViewDataProvider: LifeCycleTaskTreeView = new LifeCycleTaskTreeView(globalEventBus);

        const lifeCycleTaskTreeView: IDisposable = vscode.window.createTreeView(LifeCycleTaskTreeView.TreeViewName, {
            treeDataProvider: lifeCycleTaskTreeViewDataProvider,
        });

        vscExtCtx.subscriptions.push(
            ...[
                globalEventBus,
                pqTestResultViewPanelDisposable,
                pqSdkOutputChannel,
                disposablePqTestServices,
                pqTaskProvider,
                lifecycleCommands,
                lifeCycleTaskTreeView,
            ].reverse(),
        );

        activateMQueryDebug(vscExtCtx, "server");

        void maybeHandleNewWorkspaceCreated();
    } else {
        // do not activate for unsupported platform or architecture
        const pqSdkOutputChannel: PqSdkOutputChannel = new PqSdkOutputChannel();

        pqSdkOutputChannel.appendInfoLine(extensionI18n["PQSdk.boostrap.unsupported.arch"]);

        vscExtCtx.subscriptions.push(pqSdkOutputChannel);
    }
}

// we need not explicitly invoke deactivate callbacks for now
// vscExtCtx.subscriptions would help us do that
// export function deactivate(): void {
//     // noop
// }

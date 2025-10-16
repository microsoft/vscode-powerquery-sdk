/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as vscode from "vscode";

import * as PQLSExt from "./common/vscode-powerquery.api.d";

import { convertExtensionInfoToLibraryJson, ExtensionInfo, IPQTestService } from "./common/PQTestService";
import { getFirstWorkspaceFolder, maybeHandleNewWorkspaceCreated } from "./utils/vscodes";
import { activateMQueryDebug } from "./debugAdaptor/activateMQueryDebug";
import { ExtensionConfigurations } from "./constants/PowerQuerySdkConfiguration";
import { ExtensionConstants } from "./constants/PowerQuerySdkExtension";
import { GlobalEventBus } from "./GlobalEventBus";
import { IDisposable } from "./common/Disposable";
import { LifecycleCommands } from "./commands/LifecycleCommands";
import { LifeCycleTaskTreeView } from "./features/LifeCycleTaskTreeView";
import { PowerQueryTaskProvider } from "./features/PowerQueryTaskProvider";
import { PqSdkNugetPackageService } from "./common/PqSdkNugetPackageService";
import { PqSdkOutputChannel } from "./features/PqSdkOutputChannel";
import { PqServiceHostClient } from "./pqTestConnector/PqServiceHostClient";
import { PqTestExecutableTaskQueue } from "./pqTestConnector/PqTestExecutableTaskQueue";
import { PqTestResultViewPanel } from "./panels/PqTestResultViewPanel";
import { SchemaManagementService } from "./common/SchemaManagementService";
import { stringifyJson } from "./utils/strings";
import { registerTestController, registerCommands } from "./testing/pqtest-adapter/TestController";

export function activate(vscExtCtx: vscode.ExtensionContext): void {
    const vscPowerQuery: PQLSExt.PowerQueryApi = vscode.extensions.getExtension(
        ExtensionConstants.PQLanguageServiceExtensionId,
    )?.exports;

    const useServiceHost: boolean = ExtensionConfigurations.featureUseServiceHost;

    // let's make extension::activate serves as minimum as possible:
    // for now:
    //          it basically does the Dependency Injection,
    //          which could be replaced by *inversify* if we later really need to
    const globalEventBus: GlobalEventBus = new GlobalEventBus(vscExtCtx);
    const pqTestResultViewPanelDisposable: IDisposable = PqTestResultViewPanel.activate(vscExtCtx);
    const pqSdkOutputChannel: PqSdkOutputChannel = new PqSdkOutputChannel();

    const pqSdkNugetPackageService: PqSdkNugetPackageService = new PqSdkNugetPackageService(
        vscExtCtx,
        globalEventBus,
        pqSdkOutputChannel,
    );

    const schemaManagementService: SchemaManagementService = new SchemaManagementService(vscExtCtx, pqSdkOutputChannel);

    // Ensure schema is available on activation if NuGet package exists
    if (!schemaManagementService.userSettingsSchemaExists()) {
        const currentVersion: string =
            ExtensionConfigurations.PQTestVersion || ExtensionConstants.SuggestedPqTestNugetVersion;

        if (pqSdkNugetPackageService.nugetPqSdkExistsSync(currentVersion)) {
            schemaManagementService.copyUserSettingsSchemaFromNugetPackage(currentVersion);
        }
    }

    const disposablePqTestServices: IPQTestService & IDisposable = useServiceHost
        ? new PqServiceHostClient(globalEventBus, pqSdkOutputChannel)
        : new PqTestExecutableTaskQueue(vscExtCtx, globalEventBus, pqSdkOutputChannel);

    disposablePqTestServices.currentExtensionInfos.subscribe((infos: ExtensionInfo[]) => {
        const theUri: vscode.Uri | undefined = getFirstWorkspaceFolder()?.uri;

        if (theUri) {
            const libraryExports: PQLSExt.LibraryJson = convertExtensionInfoToLibraryJson(infos);
            pqSdkOutputChannel?.appendDebugLine(`onModuleLibraryUpdated: ${stringifyJson(libraryExports)}`);
            vscPowerQuery.onModuleLibraryUpdated(theUri.toString(), libraryExports);
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
        pqSdkNugetPackageService,
        disposablePqTestServices,
        pqSdkOutputChannel,
        schemaManagementService,
    );

    const lifeCycleTaskTreeViewDataProvider: LifeCycleTaskTreeView = new LifeCycleTaskTreeView(globalEventBus);

    const lifeCycleTaskTreeView: IDisposable = vscode.window.createTreeView(LifeCycleTaskTreeView.TreeViewName, {
        treeDataProvider: lifeCycleTaskTreeViewDataProvider,
    });

    // Register test adapter if enabled
    let testController: vscode.TestController | undefined;
    if (ExtensionConfigurations.featureEnableTestAdapter) {
        testController = registerTestController(vscExtCtx, pqSdkOutputChannel);
        registerCommands(vscExtCtx, testController, pqSdkOutputChannel);
    }

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
}

// we need not explicitly invoke deactivate callbacks for now
// vscExtCtx.subscriptions would help us do that
// export function deactivate(): void {
//     // noop
// }

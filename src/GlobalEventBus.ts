/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as fs from "fs";
import * as vscode from "vscode";

import { ExtensionConstants } from "constants/PowerQuerySdkExtension";
import { getFirstWorkspaceFolder } from "./utils/vscodes";

import {
    ConfigurationChangeEvent,
    ExtensionContext,
    workspace as vscWorkspace,
    WorkspaceFoldersChangeEvent,
} from "vscode";
import { Disposable, IDisposable } from "common/Disposable";
import { DisposableEventEmitter, ExtractEventTypes } from "common/DisposableEventEmitter";
import { FSWatcher, WatchEventType } from "fs";

// eslint-disable-next-line @typescript-eslint/typedef
export const GlobalEvents = Object.freeze({
    workspaces: Object.freeze({
        filesChangedAtWorkspace: "filesChangedAtWorkspace" as const,
    }),
    VSCodeEvents: Object.freeze({
        onDidChangeWorkspaceFolders: "onDidChangeWorkspaceFolders" as const,
        ConfigDidChangePowerQueryTestLocation: "ConfigDidChangePowerQueryTestLocation" as const,
        ConfigDidChangePQTestExtension: "ConfigDidChangePQTestExtension" as const,
        ConfigDidChangePQTestQuery: "ConfigDidChangePQTestQuery" as const,
    }),
});
type GlobalEventTypes = ExtractEventTypes<typeof GlobalEvents>;

export class GlobalEventBus extends DisposableEventEmitter<GlobalEventTypes> implements IDisposable {
    private firstWorkspaceRootFilesWatcher: FSWatcher | undefined = undefined;
    private closeFirstWorkspaceRootFilesWatcherIfNeeded(): void {
        if (this.firstWorkspaceRootFilesWatcher) {
            this.firstWorkspaceRootFilesWatcher.close();
        }
    }
    private reWatchFirstWorkspaceRootFilesWatcherIfCould(): void {
        const firstWorkspace: vscode.WorkspaceFolder | undefined = getFirstWorkspaceFolder();

        if (firstWorkspace) {
            this.closeFirstWorkspaceRootFilesWatcherIfNeeded();

            this.firstWorkspaceRootFilesWatcher = fs.watch(
                firstWorkspace.uri.fsPath,
                (_event: WatchEventType, _filename: string) => {
                    this.emit(GlobalEvents.workspaces.filesChangedAtWorkspace);
                },
            );
        }
    }

    constructor(
        private readonly vscExtCtx: ExtensionContext,
        options?: {
            /**
             * Enables automatic capturing of promise rejection.
             */
            readonly captureRejections?: boolean | undefined;
        },
    ) {
        super(options);
        this.reWatchFirstWorkspaceRootFilesWatcherIfCould();

        vscode.workspace.onDidChangeWorkspaceFolders((_e: WorkspaceFoldersChangeEvent) => {
            this.emit(GlobalEvents.VSCodeEvents.onDidChangeWorkspaceFolders);
            this.reWatchFirstWorkspaceRootFilesWatcherIfCould();
        });

        this.internalDisposables.push(
            new Disposable(() => {
                this.closeFirstWorkspaceRootFilesWatcherIfNeeded();
            }),
        );

        this.vscExtCtx.subscriptions.push(
            vscWorkspace.onDidChangeConfiguration((evt: ConfigurationChangeEvent) => {
                if (evt.affectsConfiguration(ExtensionConstants.ConfigNames.PowerQuerySdk.name)) {
                    if (
                        evt.affectsConfiguration(
                            `${ExtensionConstants.ConfigNames.PowerQuerySdk.name}.${ExtensionConstants.ConfigNames.PowerQuerySdk.properties.pqTestLocation}`,
                        )
                    ) {
                        this.emit(GlobalEvents.VSCodeEvents.ConfigDidChangePowerQueryTestLocation);
                    } else if (
                        evt.affectsConfiguration(
                            `${ExtensionConstants.ConfigNames.PowerQuerySdk.name}.${ExtensionConstants.ConfigNames.PowerQuerySdk.properties.pqTestExtensionFileLocation}`,
                        )
                    ) {
                        this.emit(GlobalEvents.VSCodeEvents.ConfigDidChangePQTestExtension);
                    } else if (
                        evt.affectsConfiguration(
                            `${ExtensionConstants.ConfigNames.PowerQuerySdk.name}.${ExtensionConstants.ConfigNames.PowerQuerySdk.properties.pqTestQueryFileLocation}`,
                        )
                    ) {
                        this.emit(GlobalEvents.VSCodeEvents.ConfigDidChangePQTestQuery);
                    } else if (
                        evt.affectsConfiguration(
                            `${ExtensionConstants.ConfigNames.PowerQuerySdk.name}.${ExtensionConstants.ConfigNames.PowerQuerySdk.properties.featuresUseDaemon}`,
                        )
                    ) {
                        void (async (): Promise<void> => {
                            const reloadAction: string = "Reload Window";

                            if (
                                (await vscode.window.showInformationMessage(
                                    "To activate a new feature, reloading the windows is required",
                                    reloadAction,
                                )) === reloadAction
                            ) {
                                void vscode.commands.executeCommand("workbench.action.reloadWindow");
                            }
                        })();
                    }
                }
            }),
        );
    }
}

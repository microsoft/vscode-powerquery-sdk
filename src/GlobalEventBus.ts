/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import { ExtensionConfigurations } from "constants/PowerQuerySdkConfiguration";
import { ExtensionConstants } from "constants/PowerQuerySdkExtension";
import { getFirstWorkspaceFolder } from "./utils/vscodes";

import {
    ConfigurationChangeEvent,
    ExtensionContext,
    Uri,
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

        if (!ExtensionConfigurations.PQTestExtensionFileLocation) {
            void vscWorkspace.findFiles("*.{mez,proj}", null, 10).then((uris: Uri[]) => {
                for (const uri of uris) {
                    const theFSPath: string = uri.fsPath;

                    if (theFSPath.indexOf(".mez") > -1) {
                        const relativePath: string = vscWorkspace.asRelativePath(uri, false);

                        void ExtensionConfigurations.setPQTestExtensionFileLocation(
                            path.join("${workspaceFolder}", path.dirname(relativePath), path.basename(relativePath)),
                        );

                        break;
                    }

                    if (theFSPath.indexOf(".proj") > -1) {
                        const relativePath: string = vscWorkspace.asRelativePath(uri, false);
                        const dirname: string = path.dirname(relativePath);
                        const mezFileName: string = path.basename(relativePath).replace(".proj", ".mez");

                        void ExtensionConfigurations.setPQTestExtensionFileLocation(
                            path.join("${workspaceFolder}", path.join(dirname, "bin"), mezFileName),
                        );
                        // do not break, in case any *.mez found
                        // break;
                    }
                }
            });
        }

        if (!ExtensionConfigurations.PQTestQueryFileLocation) {
            void vscWorkspace.findFiles("*.{m,pq}", null, 10).then((uris: Uri[]) => {
                for (const uri of uris) {
                    const theFSPath: string = uri.fsPath;

                    if (theFSPath.indexOf(".m") > -1 || theFSPath.indexOf(".query.pq") > -1) {
                        const relativePath: string = vscWorkspace.asRelativePath(uri, false);

                        void ExtensionConfigurations.setPQTestQueryFileLocation(
                            path.join("${workspaceFolder}", path.dirname(relativePath), path.basename(relativePath)),
                        );

                        break;
                    }
                }
            });
        }

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
                    }
                }
            }),
        );
    }
}

import * as path from "path";
import * as fs from "fs";
import { workspace as vscWorkspace, ExtensionContext } from "vscode";
import { ExtensionConstants } from "constants/power-query-sdk-extension";
import { ExtensionConfigurations } from "constants/power-query-sdk-configuration";
import { Disposable, IDisposable } from "common/Disposable";
import { DisposableEventEmitter, ExtractEventTypes } from "common/DisposableEventEmitter";
import { formatPath, joinPath } from "utils/paths";
import * as vscode from "vscode";
import { FSWatcher } from "fs";
import { getFirstWorkspaceFolder } from "./utils/vscodes";

// eslint-disable-next-line @typescript-eslint/typedef
export const GlobalEvents = {
    workspaces: {
        filesChangedAtWorkspace: Symbol.for("filesChangedAtWorkspace"),
    },
    VSCodeEvents: {
        onDidChangeWorkspaceFolders: Symbol.for("onDidChangeWorkspaceFolders"),
        ConfigDidChangePowerQuerySDK: Symbol.for("ConfigDidChangePowerQuerySDK"),
        ConfigDidChangePQTestExtension: Symbol.for("ConfigDidChangePQTestExtension"),
        ConfigDidChangePQTestQuery: Symbol.for("ConfigDidChangePQTestQuery"),
    },
};
type GlobalEventTypes = ExtractEventTypes<typeof GlobalEvents>;

export class GlobalEventBus extends DisposableEventEmitter<GlobalEventTypes> implements IDisposable {
    private firstWorkspaceRootFilesWatcher: FSWatcher | undefined = undefined;
    private closeFirstWorkspaceRootFilesWatcherIfNeeded() {
        if (this.firstWorkspaceRootFilesWatcher) {
            this.firstWorkspaceRootFilesWatcher.close();
        }
    }
    private reWatchFirstWorkspaceRootFilesWatcherIfCould() {
        const firstWorkspace: vscode.WorkspaceFolder | undefined = getFirstWorkspaceFolder();
        if (firstWorkspace) {
            this.closeFirstWorkspaceRootFilesWatcherIfNeeded();
            this.firstWorkspaceRootFilesWatcher = fs.watch(firstWorkspace.uri.fsPath, (_event, _filename) => {
                this.emit(GlobalEvents.workspaces.filesChangedAtWorkspace);
            });
        }
    }

    constructor(
        private readonly vscExtCtx: ExtensionContext,
        options?: {
            /**
             * Enables automatic capturing of promise rejection.
             */
            captureRejections?: boolean | undefined;
        },
    ) {
        super(options);
        this.reWatchFirstWorkspaceRootFilesWatcherIfCould();
        vscode.workspace.onDidChangeWorkspaceFolders(_e => {
            this.emit(GlobalEvents.VSCodeEvents.onDidChangeWorkspaceFolders);
            this.reWatchFirstWorkspaceRootFilesWatcherIfCould();
        });

        this.internalDisposables.push(
            new Disposable(() => {
                this.closeFirstWorkspaceRootFilesWatcherIfNeeded();
            }),
        );

        if (!ExtensionConfigurations.PQTestExtensionFileLocation) {
            vscWorkspace.findFiles("*.{mez,mproj}", null, 10).then(uris => {
                for (const uri of uris) {
                    const theFSPath: string = uri.fsPath;
                    if (theFSPath.indexOf(".mez") > -1) {
                        const relativePath: string = vscWorkspace.asRelativePath(uri, false);
                        ExtensionConfigurations.setPQTestExtensionFileLocation(
                            formatPath("${workspaceFolder}", path.dirname(relativePath), path.basename(relativePath)),
                        );
                        break;
                    }
                    if (theFSPath.indexOf(".mproj") > -1) {
                        const relativePath: string = vscWorkspace.asRelativePath(uri, false);
                        const dirname: string = path.dirname(relativePath);
                        const mezFileName: string = path.basename(relativePath).replace(".mproj", ".mez");
                        ExtensionConfigurations.setPQTestExtensionFileLocation(
                            formatPath(
                                "${workspaceFolder}",
                                joinPath(dirname === "." ? "" : dirname, "bin", "Debug"),
                                mezFileName,
                            ),
                        );
                        // do not break, in case any *.mez found
                        // break;
                    }
                }
            });
        }

        if (!ExtensionConfigurations.PQTestQueryFileLocation) {
            vscWorkspace.findFiles("*.{m,pq}", null, 10).then(uris => {
                for (const uri of uris) {
                    const theFSPath: string = uri.fsPath;
                    if (theFSPath.indexOf(".m") > -1 || theFSPath.indexOf(".query.pq") > -1) {
                        const relativePath: string = vscWorkspace.asRelativePath(uri, false);
                        ExtensionConfigurations.setPQTestQueryFileLocation(
                            formatPath("${workspaceFolder}", path.dirname(relativePath), path.basename(relativePath)),
                        );
                        break;
                    }
                }
            });
        }

        this.vscExtCtx.subscriptions.push(
            vscWorkspace.onDidChangeConfiguration(evt => {
                if (evt.affectsConfiguration(ExtensionConstants.ConfigNames.PowerQuerySdk.name)) {
                    if (
                        evt.affectsConfiguration(
                            `${ExtensionConstants.ConfigNames.PowerQuerySdk.name}.${ExtensionConstants.ConfigNames.PowerQuerySdk.properties.pqTestLocation}`,
                        )
                    ) {
                        this.emit(GlobalEvents.VSCodeEvents.ConfigDidChangePowerQuerySDK);
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

export default GlobalEventBus;

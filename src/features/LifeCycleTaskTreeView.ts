/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as vscode from "vscode";
import {
    Command,
    Event,
    EventEmitter,
    ThemeIcon,
    TreeDataProvider,
    TreeItem,
    TreeItemCollapsibleState,
    Uri,
} from "vscode";
import { GlobalEventBus, GlobalEvents } from "../GlobalEventBus";

import { debounce } from "../utils/debounce";
import { ExtensionConfigurations } from "../constants/PowerQuerySdkConfiguration";
import { extensionI18n } from "../i18n/extension";
import { getAnyPqFileBeneathTheFirstWorkspace } from "../utils/vscodes";
import { LifecycleCommands } from "../commands/LifecycleCommands";

const TreeViewPrefix: string = `powerquery.sdk.tools`;

export class LifecycleTreeViewItem extends TreeItem {
    constructor(
        label: string,
        command?: Command,
        iconPath?: string | Uri | { light: string | Uri; dark: string | Uri } | ThemeIcon,
        public readonly parent?: LifecycleTreeViewItem,
        collapsibleState: TreeItemCollapsibleState = TreeItemCollapsibleState.None,
        public readonly uri?: vscode.Uri,
    ) {
        super(label, collapsibleState);
        this.command = command;
        this.iconPath = iconPath;
    }
}

const staticLifecycleTreeViewItem: LifecycleTreeViewItem[] = [
    new LifecycleTreeViewItem(
        extensionI18n["PQSdk.lifecycleTreeView.item.createOneCredential.title"],
        {
            title: extensionI18n["PQSdk.lifecycleTreeView.item.createOneCredential.title"],
            command: `${LifecycleCommands.GenerateAndSetCredentialCommand}`,
            arguments: [],
        },
        new ThemeIcon("key"),
    ),
    new LifecycleTreeViewItem(
        extensionI18n["PQSdk.lifecycleTreeView.item.listCredentials.title"],
        {
            title: extensionI18n["PQSdk.lifecycleTreeView.item.listCredentials.title"],
            command: `${LifecycleCommands.ListCredentialCommand}`,
            arguments: [],
        },
        new ThemeIcon("library"),
    ),
    new LifecycleTreeViewItem(
        extensionI18n["PQSdk.lifecycleTreeView.item.refreshCredentials.title"],
        {
            title: extensionI18n["PQSdk.lifecycleTreeView.item.refreshCredentials.title"],
            command: `${LifecycleCommands.RefreshCredentialCommand}`,
            arguments: [],
        },
        new ThemeIcon("refresh"),
    ),
    new LifecycleTreeViewItem(
        extensionI18n["PQSdk.lifecycleTreeView.item.deleteAllCredentials.title"],
        {
            title: extensionI18n["PQSdk.lifecycleTreeView.item.deleteAllCredentials.title"],
            command: `${LifecycleCommands.DeleteCredentialCommand}`,
            arguments: [],
        },
        new ThemeIcon("terminal-kill"),
    ),
    new LifecycleTreeViewItem(
        extensionI18n["PQSdk.lifecycleTreeView.item.evaluateOpenedFile.title"],
        {
            title: extensionI18n["PQSdk.lifecycleTreeView.item.evaluateOpenedFile.title"],
            command: `${LifecycleCommands.RunTestBatteryCommand}`,
            arguments: [],
        },
        new ThemeIcon("play"),
    ),
    new LifecycleTreeViewItem(
        extensionI18n["PQSdk.lifecycleTreeView.item.testConnection.title"],
        {
            title: extensionI18n["PQSdk.lifecycleTreeView.item.testConnection.title"],
            command: `${LifecycleCommands.TestConnectionCommand}`,
            arguments: [],
        },

        new ThemeIcon("test-view-icon"),
    ),
];

const staticSetupWorkspaceTreeViewItem: LifecycleTreeViewItem = new LifecycleTreeViewItem(
    extensionI18n["PQSdk.lifecycleTreeView.item.setupWorkspace.title"],
    {
        title: extensionI18n["PQSdk.lifecycleTreeView.item.setupWorkspace.title"],
        command: `${LifecycleCommands.SetupCurrentWorkspaceCommand}`,
        arguments: [],
    },
    new ThemeIcon("pencil"),
);

export class LifeCycleTaskTreeView implements TreeDataProvider<LifecycleTreeViewItem> {
    public static TreeViewName: string = `${TreeViewPrefix}.LifeCycleTaskTreeView`;

    constructor(globalEventBus: GlobalEventBus) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        globalEventBus.on(GlobalEvents.workspaces.filesChangedAtWorkspace, (_args: any[]) => {
            this.debouncedRefresh();
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        globalEventBus.on(GlobalEvents.VSCodeEvents.onDidChangeWorkspaceFolders, (_args: any[]) => {
            this.debouncedRefresh();
        });

        // subscribe to DefaultExtensionLocation changed
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        globalEventBus.on(GlobalEvents.VSCodeEvents.ConfigDidChangePQTestExtension, (_args: any[]) => {
            this.debouncedRefresh();
        });

        // subscribe to DefaultQueryFileLocation changed
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        globalEventBus.on(GlobalEvents.VSCodeEvents.ConfigDidChangePQTestQuery, (_args: any[]) => {
            this.debouncedRefresh();
        });
    }

    private _onDidChangeTreeData: EventEmitter<LifecycleTreeViewItem | undefined> = new EventEmitter();
    get onDidChangeTreeData(): Event<void | LifecycleTreeViewItem | undefined | null> {
        return this._onDidChangeTreeData.event;
    }
    public refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    public debouncedRefresh: () => void = debounce(this.refresh.bind(this), 1e3).bind(this);

    async isValidWorkspace(): Promise<boolean> {
        return Boolean((await getAnyPqFileBeneathTheFirstWorkspace()).length);
    }

    async getChildren(element?: LifecycleTreeViewItem): Promise<LifecycleTreeViewItem[] | undefined> {
        // no collapsible item supported
        if (element) return undefined;

        if (await this.isValidWorkspace()) {
            // if we missed DefaultQueryFileLocation or DefaultExtensionLocation
            if (
                !ExtensionConfigurations.DefaultQueryFileLocation ||
                !ExtensionConfigurations.DefaultExtensionLocation
            ) {
                // do a shallow copy of the static item list
                const result: LifecycleTreeViewItem[] = staticLifecycleTreeViewItem.slice();
                // unshift staticSetupWorkspaceTreeViewItem to the items head
                result.unshift(staticSetupWorkspaceTreeViewItem);

                return result;
            }

            return staticLifecycleTreeViewItem;
        }

        // still return undefined if the workspace is not set up yet
        return undefined;
    }

    getTreeItem(element: LifecycleTreeViewItem): TreeItem | Thenable<TreeItem> {
        return element;
    }
}

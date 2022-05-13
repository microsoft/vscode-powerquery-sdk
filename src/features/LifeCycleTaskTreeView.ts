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
import { GlobalEventBus, GlobalEvents } from "GlobalEventBus";

import { debounce } from "utils/debounce";
import { getAnyPqMProjFileBeneathTheFirstWorkspace } from "../utils/vscodes";
import { LifecycleCommands } from "commands/LifecycleCommands";

const TreeViewPrefix: string = `powerquery.sdk.pqtest`;

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
    }

    private _onDidChangeTreeData: EventEmitter<LifecycleTreeViewItem | undefined> = new EventEmitter();
    get onDidChangeTreeData(): Event<void | LifecycleTreeViewItem | undefined | null> {
        return this._onDidChangeTreeData.event;
    }
    public refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    public debouncedRefresh: () => void = debounce(this.refresh.bind(this), 1e3);

    async isValidWorkspace(): Promise<boolean> {
        return Boolean((await getAnyPqMProjFileBeneathTheFirstWorkspace()).length);
    }

    async getChildren(element?: LifecycleTreeViewItem): Promise<LifecycleTreeViewItem[] | undefined> {
        // no collapsible item supported
        if (element) return undefined;

        if (await this.isValidWorkspace()) {
            // do create primary tasks
            return [
                new LifecycleTreeViewItem(
                    "Create one credential",
                    {
                        title: "Create one credential",
                        command: `${LifecycleCommands.GenerateAndSetCredentialCommand}`,
                        arguments: [],
                    },
                    new ThemeIcon("key"),
                ),
                new LifecycleTreeViewItem(
                    "List credentials",
                    {
                        title: "List credentials",
                        command: `${LifecycleCommands.ListCredentialCommand}`,
                        arguments: [],
                    },
                    new ThemeIcon("library"),
                ),
                new LifecycleTreeViewItem(
                    "Refresh credentials",
                    {
                        title: "Refresh credentials",
                        command: `${LifecycleCommands.RefreshCredentialCommand}`,
                        arguments: [],
                    },
                    new ThemeIcon("refresh"),
                ),
                new LifecycleTreeViewItem(
                    "Delete all credentials",
                    {
                        title: "Delete all credentials",
                        command: `${LifecycleCommands.DeleteCredentialCommand}`,
                        arguments: [],
                    },
                    new ThemeIcon("terminal-kill"),
                ),
                new LifecycleTreeViewItem(
                    "Evaluate the currently opened file",
                    {
                        title: "Evaluate the currently focused file",
                        command: `${LifecycleCommands.RunTestBatteryCommand}`,
                        arguments: [],
                    },
                    new ThemeIcon("debug-console-evaluation-prompt"),
                ),
                new LifecycleTreeViewItem(
                    "Test connection",
                    {
                        title: "Test connection",
                        command: `${LifecycleCommands.TestConnectionCommand}`,
                        arguments: [],
                    },

                    new ThemeIcon("test-view-icon"),
                ),
                new LifecycleTreeViewItem(
                    "Display extension info",
                    {
                        title: "Display extension info",
                        command: `${LifecycleCommands.DisplayExtensionInfoCommand}`,
                        arguments: [],
                    },
                    new ThemeIcon("extensions-info-message"),
                ),
            ] as LifecycleTreeViewItem[];
        }

        // still return undefined if the workspace is not set up yet
        return undefined;
    }

    getTreeItem(element: LifecycleTreeViewItem): TreeItem | Thenable<TreeItem> {
        return element;
    }
}

export default LifeCycleTaskTreeView;

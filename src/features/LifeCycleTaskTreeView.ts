import * as vscode from "vscode";
import {
    TreeItem,
    TreeItemCollapsibleState,
    TreeDataProvider,
    Command,
    Uri,
    ThemeIcon,
    EventEmitter,
    Event,
} from "vscode";
import { GlobalEventBus, GlobalEvents } from "GlobalEventBus";
import { LifecycleCommands } from "commands/LifecycleCommands";
import { getAnyPqMProjFileBeneathTheFirstWorkspace } from "../utils/vscodes";
import { debounce } from "utils/debounce";

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
    public static TreeViewName = `${TreeViewPrefix}.LifeCycleTaskTreeView`;

    constructor(globalEventBus: GlobalEventBus) {
        globalEventBus.on(GlobalEvents.workspaces.filesChangedAtWorkspace, _args => {
            this.debouncedRefresh();
        });
        globalEventBus.on(GlobalEvents.VSCodeEvents.onDidChangeWorkspaceFolders, _args => {
            this.debouncedRefresh();
        });
    }

    private _onDidChangeTreeData = new EventEmitter<LifecycleTreeViewItem | undefined>();
    get onDidChangeTreeData(): Event<void | LifecycleTreeViewItem | undefined | null> {
        return this._onDidChangeTreeData.event;
    }
    public refresh() {
        this._onDidChangeTreeData.fire(undefined);
    }

    public debouncedRefresh = debounce(this.refresh.bind(this), 1e3);

    async isValidWorkspace() {
        return (await getAnyPqMProjFileBeneathTheFirstWorkspace()).length;
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

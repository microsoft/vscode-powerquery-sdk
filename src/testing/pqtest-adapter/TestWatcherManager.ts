/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

/**
 * Manages file system watchers and initial test discovery for the Power Query Test extension.
 * Handles automatic synchronization of test items when settings files change or configuration updates.
 */

import * as path from "path";
import * as vscode from "vscode";

import { ExtensionConfigurations } from "../../constants/PowerQuerySdkConfiguration";
import { ExtensionConstants } from "../../constants/PowerQuerySdkExtension";
import { PqSdkOutputChannel } from "../../features/PqSdkOutputChannel";
import { extensionI18n, resolveI18nTemplate } from "../../i18n/extension";
import { refreshSettingsItem } from "./TestController";
import { getNormalizedPath, getNormalizedUriString } from "./utils/pathUtils";
// TODO: Re-enable when TestResolver is migrated
// import { resolveTestItem } from "./TestResolver";
import { getTestSettingsFileUris } from "./utils/testSettingsUtils";
import { createTestItem } from "./utils/testUtils";
import { getPathType } from "./utils/vscodeFs";

export class TestWatcherManager implements vscode.Disposable {
    private fileWatchers: Map<string, vscode.FileSystemWatcher> = new Map<string, vscode.FileSystemWatcher>();
    private directoryWatchers: Map<string, vscode.FileSystemWatcher> = new Map<string, vscode.FileSystemWatcher>();
    private disposables: vscode.Disposable[] = [];

    constructor(
        private readonly controller: vscode.TestController,
        private readonly outputChannel: PqSdkOutputChannel,
    ) {}

    /**
     * Initializes the watcher manager by setting up configuration listeners
     * and performing initial test discovery.
     */
    public async initialize(): Promise<void> {
        // Listen for configuration changes
        this.setupConfigurationWatcher();

        // Perform initial discovery and setup watchers
        await this.reset();
    }

    /**
     * Performs a full reset: clears all tests, disposes watchers,
     * re-runs top level discovery, and sets up new watchers.
     */
    private async reset(): Promise<void> {
        // If no workspace folders are open, clear everything and exit early
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            this.controller.items.replace([]);
            this.disposeWatchers();
            this.outputChannel.appendDebugLine(extensionI18n["PQSdk.testAdapter.noWorkspaceFoldersOpen"]);

            return;
        }

        this.outputChannel.appendInfoLine(extensionI18n["PQSdk.testAdapter.performingFullReset"]);

        // Dispose all existing watchers
        this.disposeWatchers();

        // Clear all test items from the controller and rediscover
        this.controller.items.replace([]);

        try {
            // Get settings file URIs and use for both discovery and watcher setup
            const settingsFileUris: vscode.Uri[] = await getTestSettingsFileUris(this.outputChannel);
            this.discoverAndRefreshTestItems(settingsFileUris);

            // Setup new watchers for the discovered files
            await this.setupFileWatchers(settingsFileUris);
        } catch (error) {
            const errorMessage: string = resolveI18nTemplate("PQSdk.testAdapter.errorSettingUpWatchers", {
                error: String(error),
            });

            this.outputChannel.appendErrorLine(errorMessage);
            vscode.window.showErrorMessage(errorMessage);
        }
    }

    /**
     * Discovers test settings files and populates the test controller with unique IDs.
     */
    private discoverAndRefreshTestItems(settingsFilesUris: vscode.Uri[]): void {
        if (settingsFilesUris.length === 0) {
            vscode.window.showErrorMessage(extensionI18n["PQSdk.testAdapter.testSettingsFilesNotFound"]);
        }

        for (const settingsFileUri of settingsFilesUris) {
            this.addTestSettingsFile(settingsFileUri, true);
        }
    }

    /**
     * Sets up a configuration watcher to detect changes to powerquery.sdk.test.settingsFiles
     */
    private setupConfigurationWatcher(): void {
        const configWatcher: vscode.Disposable = vscode.workspace.onDidChangeConfiguration(
            this.handleConfigurationChange,
            this,
            this.disposables,
        );

        this.disposables.push(configWatcher);
    }

    /**
     * Handles configuration change events
     */
    private async handleConfigurationChange(event: vscode.ConfigurationChangeEvent): Promise<void> {
        // Check if our specific configuration was affected
        const configKey: string = `${ExtensionConstants.ConfigNames.PowerQuerySdk.name}.${ExtensionConstants.ConfigNames.PowerQuerySdk.properties.testSettingsFiles}`;

        if (event.affectsConfiguration(configKey)) {
            this.outputChannel.appendInfoLine(extensionI18n["PQSdk.testAdapter.testSettingsConfigurationChanged"]);
            await this.reset();
        }
    }

    /**
     * Sets up file system watchers for all discovered test settings files and directories
     */
    private async setupFileWatchers(settingsFileUris: vscode.Uri[]): Promise<void> {
        try {
            // Watch individual settings files
            for (const uri of settingsFileUris) {
                this.createFileWatcher(uri);
            }

            // Check if we need directory watchers
            const settingsFiles: string | string[] | undefined = ExtensionConfigurations.testSettingsFiles;
            const directoriesToWatch: string[] = [];

            // Check for directories in both string and array configurations
            if (typeof settingsFiles === "string") {
                try {
                    const pathType: "file" | "directory" | "not-found" = await getPathType(settingsFiles);

                    if (pathType === "directory") {
                        directoriesToWatch.push(settingsFiles);
                    }
                } catch {
                    // Path doesn't exist or is inaccessible, show a warning and skip it
                    const errorMessage: string = resolveI18nTemplate(
                        "PQSdk.testAdapter.error.invalidSettingsPathNotWatched",
                        {
                            settingsPath: settingsFiles,
                        },
                    );

                    this.outputChannel.appendDebugLine(errorMessage);
                    vscode.window.showWarningMessage(errorMessage);
                }
            } else if (Array.isArray(settingsFiles)) {
                // Check each array element for directories
                for (const settingsFile of settingsFiles) {
                    try {
                        const pathType: "file" | "directory" | "not-found" = await getPathType(settingsFile);

                        if (pathType === "directory") {
                            directoriesToWatch.push(settingsFile);
                        }
                    } catch {
                        // Path doesn't exist or is inaccessible, show a warning and skip it
                        const errorMessage: string = resolveI18nTemplate(
                            "PQSdk.testAdapter.error.invalidSettingsPathNotWatched",
                            { settingsPath: settingsFile },
                        );

                        this.outputChannel.appendDebugLine(errorMessage);
                        vscode.window.showWarningMessage(errorMessage);
                    }
                }
            }

            // Only set up directory watchers if we found directories
            if (directoriesToWatch.length > 0) {
                this.setupDirectoryWatchers(directoriesToWatch);
            }

            this.outputChannel.appendDebugLine(
                resolveI18nTemplate("PQSdk.testAdapter.setupWatchers", {
                    watcherCount: String(this.fileWatchers.size),
                }),
            );

            this.outputChannel.appendDebugLine(
                resolveI18nTemplate("PQSdk.testAdapter.setupDirectoryWatchers", {
                    watcherCount: String(this.directoryWatchers.size),
                }),
            );
        } catch (error) {
            this.outputChannel.appendErrorLine(
                resolveI18nTemplate("PQSdk.testAdapter.errorSettingUpWatchers", { error: String(error) }),
            );
        }
    }

    /**
     * Creates a file watcher for a specific settings file
     */
    private createFileWatcher(uri: vscode.Uri): void {
        const workspaceFolder: vscode.WorkspaceFolder =
            vscode.workspace.getWorkspaceFolder(uri) || vscode.workspace.workspaceFolders![0];

        const relativePath: string = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);

        const pattern: vscode.RelativePattern = new vscode.RelativePattern(workspaceFolder, relativePath);

        const watcher: vscode.FileSystemWatcher = vscode.workspace.createFileSystemWatcher(pattern);

        watcher.onDidChange(this.onFileChanged, this, this.disposables);
        watcher.onDidDelete(this.onFileDeleted, this, this.disposables);

        // Use normalized URI string as key for consistent lookups
        this.fileWatchers.set(getNormalizedUriString(uri), watcher);
        this.disposables.push(watcher);
    }

    /**
     * Sets up directory watchers for the specified directories
     */
    private setupDirectoryWatchers(directoriesToWatch: string[]): void {
        for (const directoryPath of directoriesToWatch) {
            this.createDirectoryWatcher(directoryPath);
        }
    }

    /**
     * Creates a directory watcher for a specific directory
     */
    private createDirectoryWatcher(directoryPath: string): void {
        const pattern: vscode.RelativePattern = new vscode.RelativePattern(
            directoryPath,
            ExtensionConstants.TestAdapter.TestSettingsFilePattern,
        );

        const watcher: vscode.FileSystemWatcher = vscode.workspace.createFileSystemWatcher(pattern);

        watcher.onDidCreate(this.onFileCreatedInDirectory, this, this.disposables);
        watcher.onDidDelete(this.onFileDeletedFromDirectory, this, this.disposables);

        this.directoryWatchers.set(directoryPath, watcher);
        this.disposables.push(watcher);
    }

    /**
     * Handles file change events for settings files
     */
    private async onFileChanged(uri: vscode.Uri): Promise<void> {
        this.outputChannel.appendDebugLine(
            resolveI18nTemplate("PQSdk.testAdapter.fileChanged", { filePath: uri.fsPath }),
        );

        // Find the corresponding test item
        const testItem: vscode.TestItem | undefined = this.findTestItemByUri(uri);

        if (testItem) {
            // Only update if the item was expanded (has children)
            if (testItem.children.size > 0) {
                this.outputChannel.appendDebugLine(
                    resolveI18nTemplate("PQSdk.testAdapter.refreshingExpandedItem", { filePath: uri.fsPath }),
                );

                // Clear children and re-resolve
                testItem.children.replace([]);

                await refreshSettingsItem(testItem, this.controller, this.outputChannel);
            } else {
                this.outputChannel.appendDebugLine(
                    resolveI18nTemplate("PQSdk.testAdapter.skippingUnexpandedItem", { filePath: uri.fsPath }),
                );
            }
        }
    }

    /**
     * Handles file deletion events for settings files
     */
    private onFileDeleted(uri: vscode.Uri): void {
        this.outputChannel.appendDebugLine(
            resolveI18nTemplate("PQSdk.testAdapter.fileDeleted", { filePath: uri.fsPath }),
        );

        // Find and remove the corresponding test item
        const testItem: vscode.TestItem | undefined = this.findTestItemByUri(uri);

        if (testItem) {
            this.controller.items.delete(testItem.id);
        }

        // Dispose the watcher for this file using normalized URI
        const normalizedUriString: string = getNormalizedUriString(uri);
        const watcher: vscode.FileSystemWatcher | undefined = this.fileWatchers.get(normalizedUriString);

        if (watcher) {
            watcher.dispose();
            this.fileWatchers.delete(normalizedUriString);
        }
    }

    /**
     * Handles file creation events in watched directories
     */
    private onFileCreatedInDirectory(uri: vscode.Uri): void {
        this.outputChannel.appendDebugLine(
            resolveI18nTemplate("PQSdk.testAdapter.fileCreatedInDirectory", { filePath: uri.fsPath }),
        );

        // Validate that the new file is a valid test settings file
        if (!uri.fsPath.endsWith(ExtensionConstants.TestAdapter.TestSettingsFileEnding)) {
            this.outputChannel.appendDebugLine(
                resolveI18nTemplate("PQSdk.testAdapter.skippingNonTestFile", { filePath: uri.fsPath }),
            );

            return;
        }

        try {
            const testItem: vscode.TestItem | undefined = this.addTestSettingsFile(uri);

            if (testItem) {
                // Create a file watcher for this new settings file
                this.createFileWatcher(uri);

                this.outputChannel.appendDebugLine(
                    resolveI18nTemplate("PQSdk.testAdapter.addedNewTestItem", { filePath: uri.fsPath }),
                );
            }
        } catch (error) {
            const errorMessage: string = resolveI18nTemplate("PQSdk.testAdapter.errorAddingTestItem", {
                filePath: uri.fsPath,
                error: String(error),
            });

            this.outputChannel.appendErrorLine(errorMessage);
            vscode.window.showErrorMessage(errorMessage);
        }
    }

    /**
     * Handles file deletion events in watched directories
     */
    private onFileDeletedFromDirectory(uri: vscode.Uri): void {
        this.outputChannel.appendDebugLine(
            resolveI18nTemplate("PQSdk.testAdapter.fileDeletedFromDirectory", { filePath: uri.fsPath }),
        );

        // The individual file watcher should have already handled this,
        // but in case it didn't, let's ensure the test item is removed
        const testItem: vscode.TestItem | undefined = this.findTestItemByUri(uri);

        if (testItem) {
            this.controller.items.delete(testItem.id);
        }
    }

    /**
     * Creates and adds a test item for a given settings file URI.
     * @param settingsFileUri The URI of the settings file.
     * @param forceUniqueId If true, a unique ID is generated to prevent VS Code from restoring the item's previous state.
     * @returns The created TestItem, or undefined if the file is not in a workspace.
     */
    private addTestSettingsFile(
        settingsFileUri: vscode.Uri,
        forceUniqueId: boolean = false,
    ): vscode.TestItem | undefined {
        const workspaceFolder: vscode.WorkspaceFolder | undefined =
            vscode.workspace.getWorkspaceFolder(settingsFileUri);

        if (!workspaceFolder) {
            // Only show error if workspaces exist but this file isn't in any of them
            // Silent skip when no workspaces are open at all
            if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                const errorMessage: string = resolveI18nTemplate("PQSdk.testAdapter.error.settingsFileNotInWorkspace", {
                    settingsFilePath: settingsFileUri.fsPath,
                });

                this.outputChannel.appendDebugLine(errorMessage);
                vscode.window.showErrorMessage(errorMessage);
            }

            return undefined;
        }

        const normalizedSettingsUri: vscode.Uri = vscode.Uri.file(getNormalizedPath(settingsFileUri.fsPath));
        const label: string = path.basename(settingsFileUri.fsPath);

        // The ID is what VS Code uses to uniquely identify the test item.
        // By default, we use the normalized URI.
        // For resets, we append a timestamp to force VS Code to treat it as a new item,
        // preventing state restoration (e.g., expanded/collapsed state).
        const id: string = forceUniqueId
            ? `${normalizedSettingsUri.toString()}?${Date.now()}`
            : getNormalizedUriString(settingsFileUri);

        const testItem: vscode.TestItem = createTestItem(
            this.controller,
            id,
            label,
            normalizedSettingsUri,
            true, // canResolveChildren
        );

        this.controller.items.add(testItem);

        return testItem;
    }

    /**
     * Finds a test item by its URI using normalized comparison
     */
    private findTestItemByUri(uri: vscode.Uri): vscode.TestItem | undefined {
        const normalizedSearchUri: string = getNormalizedUriString(uri);

        // Search through top-level items to find one with matching normalized URI
        for (const [, item] of this.controller.items) {
            if (item.uri) {
                const normalizedItemUri: string = getNormalizedUriString(item.uri);

                if (normalizedItemUri === normalizedSearchUri) {
                    return item;
                }
            }
        }

        return undefined;
    }

    /**
     * Disposes all file and directory watchers
     */
    private disposeWatchers(): void {
        // Dispose file watchers
        for (const watcher of this.fileWatchers.values()) {
            watcher.dispose();
        }

        this.fileWatchers.clear();

        // Dispose directory watchers
        for (const watcher of this.directoryWatchers.values()) {
            watcher.dispose();
        }

        this.directoryWatchers.clear();
    }

    /**
     * Disposes all resources managed by this class
     */
    public dispose(): void {
        this.disposeWatchers();

        for (const disposable of this.disposables) {
            disposable.dispose();
        }

        this.disposables = [];
    }
}

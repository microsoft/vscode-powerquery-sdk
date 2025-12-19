/**
 * Manages file system watchers and test discovery for the Power Query Test extension.
 * Handles automatic synchronization of test items when files change or configuration updates.
 */

import * as vscode from "vscode";
import * as path from "path";

import { ExtensionConstants } from "../../constants/PowerQuerySdkExtension";
import { ExtensionConfigurations } from "../../constants/PowerQuerySdkConfiguration";
import { getPathType } from "../../utils/files";
// TODO: Re-enable when TestResolver is migrated
// import { resolveTestItem } from "./TestResolver";
import { getTestSettingsFileUris } from "./utils/testSettingsUtils";
import { createTestItem } from "./utils/testUtils";
import { PqSdkOutputChannel } from "../../features/PqSdkOutputChannel";
import { getNormalizedPath, getNormalizedUriString } from "./utils/pathUtils";
import { extensionI18n, resolveI18nTemplate } from "../../i18n/extension";

export class TestWatcherManager implements vscode.Disposable {
    private fileWatchers = new Map<string, vscode.FileSystemWatcher>();
    private directoryWatchers = new Map<string, vscode.FileSystemWatcher>();
    private disposables: vscode.Disposable[] = [];

    constructor(
        private readonly controller: vscode.TestController,
        private readonly outputChannel: PqSdkOutputChannel
    ) { }

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
     * re-runs discovery, and sets up new watchers.
     */
    private async reset(): Promise<void> {
        this.outputChannel.appendInfoLine(extensionI18n["PQSdk.testAdapter.performingFullReset"]);

        // Dispose all existing watchers
        this.disposeWatchers();

        // Clear all test items from the controller and rediscover
        this.controller.items.replace([]);

        try {
            // Get settings file URIs and use for both discovery and watcher setup
            const settingsFileUris = await getTestSettingsFileUris(this.outputChannel);
            this.discoverAndRefreshTestItems(settingsFileUris);

            // Setup new watchers for the discovered files
            await this.setupFileWatchers(settingsFileUris);
        } catch (error) {
            const errorMessage = resolveI18nTemplate("PQSdk.testAdapter.errorSettingUpWatchers", { error: String(error) });
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
     * Sets up a configuration watcher to detect changes to powerquery.test.settingsFiles
     */
    private setupConfigurationWatcher(): void {
        const configWatcher = vscode.workspace.onDidChangeConfiguration(
            this.handleConfigurationChange,
            this,
            this.disposables
        );
        this.disposables.push(configWatcher);
    }

    /**
     * Handles configuration change events
     */
    private async handleConfigurationChange(event: vscode.ConfigurationChangeEvent): Promise<void> {
        // Check if our specific configuration was affected
        const configKey = `${ExtensionConstants.ConfigNames.PowerQuerySdk.name}.${ExtensionConstants.ConfigNames.PowerQuerySdk.properties.testSettingsFiles}`;
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

            // Only check for directories if the config is a string (not an array)
            // Arrays can only contain individual files, not directories
            if (typeof settingsFiles === "string") {
                try {
                    const pathType = await getPathType(settingsFiles);
                    if (pathType === 'directory') {
                        directoriesToWatch.push(settingsFiles);
                    }
                } catch (error) {
                    // Path doesn't exist or is inaccessible, show a warning and skip it
                    const errorMessage = resolveI18nTemplate(
                        "PQSdk.testAdapter.error.invalidSettingsPathNotWatched",
                        { settingsPath: settingsFiles }
                    );
                    this.outputChannel.appendDebugLine(errorMessage);
                    vscode.window.showWarningMessage(errorMessage);
                }
            }

            // Only set up directory watchers if we found directories
            if (directoriesToWatch.length > 0) {
                this.setupDirectoryWatchers(directoriesToWatch);
            }

            this.outputChannel.appendDebugLine(resolveI18nTemplate("PQSdk.testAdapter.setupWatchers", { watcherCount: String(this.fileWatchers.size) }));
            this.outputChannel.appendDebugLine(resolveI18nTemplate("PQSdk.testAdapter.setupDirectoryWatchers", { watcherCount: String(this.directoryWatchers.size) }));
        } catch (error) {
            this.outputChannel.appendErrorLine(resolveI18nTemplate("PQSdk.testAdapter.errorSettingUpWatchers", { error: String(error) }));
        }
    }

    /**
     * Creates a file watcher for a specific settings file
     */
    private createFileWatcher(uri: vscode.Uri): void {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri) || vscode.workspace.workspaceFolders![0];
        const relativePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);

        const pattern = new vscode.RelativePattern(workspaceFolder, relativePath);

        const watcher = vscode.workspace.createFileSystemWatcher(pattern);

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
        const pattern = new vscode.RelativePattern(
            directoryPath,
            ExtensionConstants.TestAdapter.TestSettingsFilePattern
        );

        const watcher = vscode.workspace.createFileSystemWatcher(pattern);

        watcher.onDidCreate(this.onFileCreatedInDirectory, this, this.disposables);
        watcher.onDidDelete(this.onFileDeletedFromDirectory, this, this.disposables);

        this.directoryWatchers.set(directoryPath, watcher);
        this.disposables.push(watcher);
    }

    /**
     * Handles file change events for settings files
     */
    private async onFileChanged(uri: vscode.Uri): Promise<void> {
        this.outputChannel.appendDebugLine(resolveI18nTemplate("PQSdk.testAdapter.fileChanged", { filePath: uri.fsPath }));

        // Find the corresponding test item
        const testItem = this.findTestItemByUri(uri);
        if (testItem) {
            // Only update if the item was expanded (has children)
            if (testItem.children.size > 0) {
                this.outputChannel.appendDebugLine(resolveI18nTemplate("PQSdk.testAdapter.refreshingExpandedItem", { filePath: uri.fsPath }));

                // Clear children and re-resolve
                testItem.children.replace([]);
                // TODO: Re-enable when TestResolver is migrated
                // await resolveTestItem(testItem, this.controller, this.outputChannel);
            } else {
                this.outputChannel.appendDebugLine(resolveI18nTemplate("PQSdk.testAdapter.skippingUnexpandedItem", { filePath: uri.fsPath }));
            }
        }
    }

    /**
     * Handles file deletion events for settings files
     */
    private onFileDeleted(uri: vscode.Uri): void {
        this.outputChannel.appendDebugLine(resolveI18nTemplate("PQSdk.testAdapter.fileDeleted", { filePath: uri.fsPath }));

        // Find and remove the corresponding test item
        const testItem = this.findTestItemByUri(uri);
        if (testItem) {
            this.controller.items.delete(testItem.id);
        }

        // Dispose the watcher for this file using normalized URI
        const normalizedUriString = getNormalizedUriString(uri);
        const watcher = this.fileWatchers.get(normalizedUriString);
        if (watcher) {
            watcher.dispose();
            this.fileWatchers.delete(normalizedUriString);
        }
    }

    /**
     * Handles file creation events in watched directories
     */
    private async onFileCreatedInDirectory(uri: vscode.Uri): Promise<void> {
        this.outputChannel.appendDebugLine(resolveI18nTemplate("PQSdk.testAdapter.fileCreatedInDirectory", { filePath: uri.fsPath }));

        // Validate that the new file is a valid test settings file
        if (!uri.fsPath.endsWith(ExtensionConstants.TestAdapter.TestSettingsFileEnding)) {
            this.outputChannel.appendDebugLine(resolveI18nTemplate("PQSdk.testAdapter.skippingNonTestFile", { filePath: uri.fsPath }));
            return;
        }

        try {
            const testItem = this.addTestSettingsFile(uri);

            if (testItem) {
                // Create a file watcher for this new settings file
                this.createFileWatcher(uri);
                this.outputChannel.appendDebugLine(resolveI18nTemplate("PQSdk.testAdapter.addedNewTestItem", { filePath: uri.fsPath }));
            }
        } catch (error) {
            const errorMessage = resolveI18nTemplate("PQSdk.testAdapter.errorAddingTestItem", { filePath: uri.fsPath, error: String(error) });
            this.outputChannel.appendErrorLine(errorMessage);
            vscode.window.showErrorMessage(errorMessage);
        }
    }

    /**
     * Handles file deletion events in watched directories
     */
    private onFileDeletedFromDirectory(uri: vscode.Uri): void {
        this.outputChannel.appendDebugLine(resolveI18nTemplate("PQSdk.testAdapter.fileDeletedFromDirectory", { filePath: uri.fsPath }));

        // The individual file watcher should have already handled this,
        // but in case it didn't, let's ensure the test item is removed
        const testItem = this.findTestItemByUri(uri);
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
        forceUniqueId = false
    ): vscode.TestItem | undefined {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(settingsFileUri);
        if (!workspaceFolder) {
            const errorMessage = resolveI18nTemplate(
                "PQSdk.testAdapter.error.settingsFileNotInWorkspace",
                { settingsFilePath: settingsFileUri.fsPath }
            );
            this.outputChannel.appendDebugLine(errorMessage);
            vscode.window.showErrorMessage(errorMessage);
            return undefined;
        }

        const normalizedSettingsUri = vscode.Uri.file(getNormalizedPath(settingsFileUri.fsPath));
        const label = path.basename(settingsFileUri.fsPath);

        // The ID is what VS Code uses to uniquely identify the test item.
        // By default, we use the normalized URI.
        // For resets, we append a timestamp to force VS Code to treat it as a new item,
        // preventing state restoration (e.g., expanded/collapsed state).
        const id = forceUniqueId
            ? `${normalizedSettingsUri.toString()}?${Date.now()}`
            : getNormalizedUriString(settingsFileUri);

        const testItem = createTestItem(
            this.controller,
            id,
            label,
            normalizedSettingsUri,
            true // canResolveChildren
        );

        this.controller.items.add(testItem);
        return testItem;
    }

    /**
     * Finds a test item by its URI using normalized comparison
     */
    private findTestItemByUri(uri: vscode.Uri): vscode.TestItem | undefined {
        const normalizedSearchUri = getNormalizedUriString(uri);

        // Search through top-level items to find one with matching normalized URI
        for (const [, item] of this.controller.items) {
            if (item.uri) {
                const normalizedItemUri = getNormalizedUriString(item.uri);
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

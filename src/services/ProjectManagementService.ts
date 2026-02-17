/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as path from "path";
import * as vscode from "vscode";
import { ExtensionContext, Uri, WorkspaceFolder } from "vscode";

import { IPQTestService } from "../common/PQTestService";
import { ExtensionConfigurations } from "../constants/PowerQuerySdkConfiguration";
import { ExtensionConstants } from "../constants/PowerQuerySdkExtension";
import { PqSdkOutputChannel } from "../features/PqSdkOutputChannel";
import { extensionI18n, resolveI18nTemplate } from "../i18n/extension";
import type { IFileSystem } from "../testing/abstractions/IFileSystem";
import type { IUIService } from "../testing/abstractions/IUIService";
import { resolveTemplateSubstitutedValues } from "../utils/strings";
import {
    getAnyPqFileBeneathTheFirstWorkspace,
    getFirstWorkspaceFolder,
    resolveSubstitutedValues,
    substitutedWorkspaceFolderBasenameIfNeeded,
    updateCurrentLocalPqModeIfNeeded,
} from "../utils/vscodes";

const validateProjectNameRegExp: RegExp = /[A-Za-z]+/;
const templateFileBaseName: string = "PQConn";

export interface IProjectManagementService {
    /**
     * Create a new Power Query project with the given name
     */
    createNewProject(): Promise<void>;

    /**
     * Build the current project
     */
    buildProject(): Promise<void>;

    /**
     * Setup the current workspace for Power Query development
     */
    setupCurrentWorkspace(): Promise<unknown>;

    /**
     * Prompt to setup workspace if needed
     */
    promptToSetupCurrentWorkspaceIfNeeded(): Promise<void>;
}

export class ProjectManagementService implements IProjectManagementService {
    private isSuggestingSetupCurrentWorkspace: boolean = false;

    constructor(
        private readonly vscExtCtx: ExtensionContext,
        private readonly fileSystem: IFileSystem,
        private readonly uiService: IUIService,
        private readonly pqTestService: IPQTestService,
        private readonly outputChannel: PqSdkOutputChannel,
    ) {}

    public async createNewProject(): Promise<void> {
        const newProjName: string | undefined = await this.uiService.showInputBox({
            title: extensionI18n["PQSdk.lifecycle.command.new.project.title"],
            placeHolder: extensionI18n["PQSdk.lifecycle.command.new.project.placeHolder"],
            validateInput(value: string): string | undefined {
                if (!value) {
                    return extensionI18n["PQSdk.lifecycle.error.empty.project.name"];
                } else if (!value.match(validateProjectNameRegExp)) {
                    return extensionI18n["PQSdk.lifecycle.error.invalid.project.name"];
                }

                return undefined;
            },
        });

        if (newProjName) {
            const firstWorkspaceFolder: WorkspaceFolder | undefined = getFirstWorkspaceFolder();

            if (firstWorkspaceFolder) {
                // Generate files into the first workspace
                const targetFolder: string = this.generateProjectIntoFolder(
                    firstWorkspaceFolder.uri.fsPath,
                    newProjName,
                );

                if (targetFolder === firstWorkspaceFolder.uri.fsPath) {
                    // Show info message and open the main project file
                    await vscode.commands.executeCommand(
                        "vscode.open",
                        vscode.Uri.file(path.join(targetFolder, `${newProjName}.pq`)),
                    );

                    void this.uiService.showInformationMessage(
                        resolveI18nTemplate("PQSdk.lifecycle.command.new.project.created", {
                            newProjName,
                            targetFolder,
                        }),
                    );
                } else {
                    // Open the sub folder as the current workspace
                    await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(targetFolder));
                }
            } else {
                // Need to open a folder and generate into it
                const selectedFolders: Uri[] | undefined = await this.uiService.showOpenDialog({
                    canSelectMany: false,
                    openLabel: extensionI18n["PQSdk.lifecycle.command.select.workspace"],
                    canSelectFiles: false,
                    canSelectFolders: true,
                });

                if (selectedFolders?.[0]?.fsPath) {
                    const targetFolder: string = this.generateProjectIntoFolder(selectedFolders[0].fsPath, newProjName);

                    await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(targetFolder));
                }
            }
        }
    }

    public buildProject(): Promise<void> {
        return this.pqTestService.ExecuteBuildTaskAndAwaitIfNeeded();
    }

    public async setupCurrentWorkspace(): Promise<unknown> {
        const tasks: Array<Promise<void>> = [];

        const nullableFirstWorkspaceUri: vscode.Uri | undefined = getFirstWorkspaceFolder()?.uri;
        let hasPQTestExtensionFileLocation: boolean = false;

        if (ExtensionConfigurations.DefaultExtensionLocation) {
            const resolvedPQTestExtensionFileLocation: string | undefined = resolveSubstitutedValues(
                ExtensionConfigurations.DefaultExtensionLocation,
            );

            hasPQTestExtensionFileLocation = Boolean(
                resolvedPQTestExtensionFileLocation && this.fileSystem.existsSync(resolvedPQTestExtensionFileLocation),
            );
        }

        if (nullableFirstWorkspaceUri) {
            updateCurrentLocalPqModeIfNeeded(nullableFirstWorkspaceUri.fsPath);
        }

        if (!hasPQTestExtensionFileLocation) {
            tasks.push(this.setupDefaultExtensionLocation());
        }

        const firstWorkspaceUri: vscode.Uri | undefined = getFirstWorkspaceFolder()?.uri;

        if (firstWorkspaceUri) {
            const nullableAnyPqFileInTheWorkspace: vscode.Uri[] = await getAnyPqFileBeneathTheFirstWorkspace();

            if (nullableAnyPqFileInTheWorkspace.length > 0) {
                tasks.push(this.setupDefaultQueryFileLocation(nullableAnyPqFileInTheWorkspace[0]));
            }
        }

        return Promise.all(tasks);
    }

    public async promptToSetupCurrentWorkspaceIfNeeded(): Promise<void> {
        const theFirstWorkspace: vscode.WorkspaceFolder | undefined = getFirstWorkspaceFolder();

        if (theFirstWorkspace && !this.isSuggestingSetupCurrentWorkspace && ExtensionConfigurations.autoDetection) {
            this.isSuggestingSetupCurrentWorkspace = true;
            const anyPqFiles: Uri[] = await getAnyPqFileBeneathTheFirstWorkspace();

            if (
                anyPqFiles.length &&
                !ExtensionConfigurations.DefaultQueryFileLocation &&
                !ExtensionConfigurations.DefaultExtensionLocation
            ) {
                const enableStr: string = extensionI18n["PQSdk.common.enable"];

                const result: string | undefined = await this.uiService.showInformationMessage(
                    extensionI18n["PQSdk.lifecycle.prompt.update.workspace"],
                    enableStr,
                    extensionI18n["PQSdk.common.cancel"],
                );

                if (result === enableStr) {
                    void this.setupCurrentWorkspace();
                }
            }

            this.isSuggestingSetupCurrentWorkspace = false;
        }
    }

    private generateProjectIntoFolder(inputFolder: string, projectName: string): string {
        const folder: string = inputFolder.endsWith(projectName) ? inputFolder : path.join(inputFolder, projectName);

        this.fileSystem.mkdirSync(folder, { recursive: true });

        const templateTargetFolder: string = path.resolve(this.vscExtCtx.extensionPath, "templates");

        // Create .vscode folder and copy settings.json
        if (!this.fileSystem.existsSync(path.join(folder, ".vscode"))) {
            this.fileSystem.mkdirSync(path.join(folder, ".vscode"));
        }

        this.fileSystem.copyFileSync(
            path.resolve(templateTargetFolder, "settings.json"),
            path.resolve(folder, ".vscode", "settings.json"),
        );

        // Copy PNG icons
        ["16", "20", "24", "32", "40", "48", "64", "80"].forEach((onePngSize: string) => {
            this.fileSystem.copyFileSync(
                path.resolve(templateTargetFolder, `${templateFileBaseName}${onePngSize}.png`),
                path.resolve(folder, `${projectName}${onePngSize}.png`),
            );
        });

        // Process template files
        [
            [`${templateFileBaseName}.proj`, `${projectName}.proj`],
            [`${templateFileBaseName}.pq`, `${projectName}.pq`],
            [`${templateFileBaseName}.query.pq`, `${projectName}.query.pq`],
            ["resources.resx", "resources.resx"],
        ].forEach(([templateFileName, targetFileName]: string[]) => {
            let content: string = this.fileSystem.readFileSync(path.resolve(templateTargetFolder, templateFileName), {
                encoding: "utf8",
            });

            // Apply template substitutions
            content = resolveTemplateSubstitutedValues(content, { ProjectName: projectName });
            this.fileSystem.writeFileSync(path.resolve(folder, targetFileName), content, { encoding: "utf8" });
        });

        return folder;
    }

    private async setupDefaultExtensionLocation(): Promise<void> {
        const mezUrlsBeneathBin: Uri[] = await vscode.workspace.findFiles("bin/**/*.{mez}", null, 1);

        let mezExtensionPath: string = path.join(
            "${workspaceFolder}",
            "bin",
            "AnyCPU",
            "Debug",
            "${workspaceFolderBasename}.mez",
        );

        if (mezUrlsBeneathBin.length) {
            const relativePath: string = vscode.workspace.asRelativePath(mezUrlsBeneathBin[0], false);

            mezExtensionPath = path.join(
                "${workspaceFolder}",
                path.dirname(relativePath),
                substitutedWorkspaceFolderBasenameIfNeeded(path.basename(relativePath)),
            );
        }

        if (ExtensionConfigurations.DefaultExtensionLocation !== mezExtensionPath) {
            void ExtensionConfigurations.setDefaultExtensionLocation(mezExtensionPath);

            this.outputChannel.appendInfoLine(
                resolveI18nTemplate("PQSdk.lifecycle.command.set.config", {
                    configName: ExtensionConstants.ConfigNames.PowerQuerySdk.properties.defaultExtensionLocation,
                    configValue: mezExtensionPath,
                }),
            );
        }
    }

    private setupDefaultQueryFileLocation(anyPqFile: vscode.Uri): Promise<void> {
        const pqQueryPath: string = path.join("${workspaceFolder}", vscode.workspace.asRelativePath(anyPqFile, false));

        if (ExtensionConfigurations.DefaultQueryFileLocation !== pqQueryPath) {
            void ExtensionConfigurations.setDefaultQueryFileLocation(pqQueryPath);

            this.outputChannel.appendInfoLine(
                resolveI18nTemplate("PQSdk.lifecycle.command.set.config", {
                    configName: ExtensionConstants.ConfigNames.PowerQuerySdk.properties.defaultQueryFileLocation,
                    configValue: pqQueryPath,
                }),
            );
        }

        return Promise.resolve();
    }
}

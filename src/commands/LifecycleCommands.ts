/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as fs from "fs";
import * as path from "path";
import * as process from "process";
import * as vscode from "vscode";

import {
    ExtensionContext,
    InputBoxOptions,
    Progress,
    ProgressLocation,
    Uri,
    workspace as vscWorkspace,
    WorkspaceFolder,
} from "vscode";
import { FSWatcher, WatchEventType } from "fs";

import { GlobalEventBus, GlobalEvents } from "../GlobalEventBus";

import type { PqServiceHostClient } from "../pqTestConnector/PqServiceHostClient";

import {
    AuthenticationKind,
    CreateAuthState,
    ExtensionInfo,
    GenericResult,
    IPQTestService,
} from "../common/PQTestService";
import {
    ExtensionConfigurations,
    promptWarningMessageForExternalDependency,
} from "../constants/PowerQuerySdkConfiguration";
import {
    getAnyPqFileBeneathTheFirstWorkspace,
    getFirstWorkspaceFolder,
    resolveSubstitutedValues,
    substitutedWorkspaceFolderBasenameIfNeeded,
} from "../utils/vscodes";
import { InputStep, MultiStepInput } from "../common/MultiStepInput";
import { PqTestResultViewPanel, SimplePqTestResultViewBroker } from "../panels/PqTestResultViewPanel";
import { prettifyJson, resolveTemplateSubstitutedValues } from "../utils/strings";

import { extensionI18n, resolveI18nTemplate } from "../i18n/extension";
import { debounce } from "../utils/debounce";
import { ExtensionConstants } from "../constants/PowerQuerySdkExtension";
import { NugetHttpService } from "../common/NugetHttpService";
import { NugetVersions } from "../utils/NugetVersions";
import { PqSdkOutputChannel } from "../features/PqSdkOutputChannel";
import { SpawnedProcess } from "../common/SpawnedProcess";

const CommandPrefix: string = `powerquery.sdk.pqtest`;

const validateProjectNameRegExp: RegExp = /[A-Za-z]+/;
const templateFileBaseName: string = "PQConn";

export class LifecycleCommands {
    static SeizePqTestCommand: string = `${CommandPrefix}.SeizePqTestCommand`;
    static SetupCurrentWorkspaceCommand: string = `${CommandPrefix}.SetupCurrentWorkspaceCommand`;
    static CreateNewProjectCommand: string = `${CommandPrefix}.CreateNewProjectCommand`;
    static DeleteCredentialCommand: string = `${CommandPrefix}.DeleteCredentialCommand`;
    static DisplayExtensionInfoCommand: string = `${CommandPrefix}.DisplayExtensionInfoCommand`;
    static ListCredentialCommand: string = `${CommandPrefix}.ListCredentialCommand`;
    static GenerateAndSetCredentialCommand: string = `${CommandPrefix}.GenerateAndSetCredentialCommand`;
    static RefreshCredentialCommand: string = `${CommandPrefix}.RefreshCredentialCommand`;
    static RunTestBatteryCommand: string = `${CommandPrefix}.RunTestBatteryCommand`;
    static TestConnectionCommand: string = `${CommandPrefix}.TestConnectionCommand`;

    private isSuggestingSetupCurrentWorkspace: boolean = false;

    constructor(
        private readonly vscExtCtx: ExtensionContext,
        readonly globalEventBus: GlobalEventBus,
        private readonly nugetHttpService: NugetHttpService,
        private readonly pqTestService: IPQTestService,
        private readonly outputChannel: PqSdkOutputChannel,
    ) {
        vscExtCtx.subscriptions.push(
            vscode.commands.registerCommand(LifecycleCommands.SeizePqTestCommand, this.manuallyUpdatePqTest.bind(this)),
            vscode.commands.registerCommand(
                LifecycleCommands.SetupCurrentWorkspaceCommand,
                this.setupCurrentlyOpenedWorkspaceCommand.bind(this),
            ),
            vscode.commands.registerCommand(
                LifecycleCommands.CreateNewProjectCommand,
                this.generateOneNewProject.bind(this),
            ),
            vscode.commands.registerCommand(
                LifecycleCommands.DeleteCredentialCommand,
                this.commandGuard(this.deleteCredentialCommand).bind(this),
            ),
            vscode.commands.registerCommand(
                LifecycleCommands.DisplayExtensionInfoCommand,
                this.commandGuard(this.displayExtensionInfoCommand).bind(this),
            ),
            vscode.commands.registerCommand(
                LifecycleCommands.ListCredentialCommand,
                this.commandGuard(this.listCredentialCommand).bind(this),
            ),
            vscode.commands.registerCommand(
                LifecycleCommands.GenerateAndSetCredentialCommand,
                this.commandGuard(this.generateAndSetCredentialCommandV2).bind(this),
            ),
            vscode.commands.registerCommand(
                LifecycleCommands.RefreshCredentialCommand,
                this.commandGuard(this.refreshCredentialCommand).bind(this),
            ),
            vscode.commands.registerCommand(
                LifecycleCommands.RunTestBatteryCommand,
                this.commandGuard(this.runTestBatteryCommand).bind(this),
            ),
            vscode.commands.registerCommand(
                LifecycleCommands.TestConnectionCommand,
                this.commandGuard(this.testConnectionCommand).bind(this),
            ),
        );

        globalEventBus.subscribeOneEvent(GlobalEvents.workspaces.filesChangedAtWorkspace, () => {
            if (!this.mezFilesWatcher) {
                this.watchMezFileIfNeeded();
            }
        });

        globalEventBus.subscribeOneEvent(GlobalEvents.VSCodeEvents.ConfigDidChangePQTestExtension, () => {
            this.watchMezFileIfNeeded();
        });

        // this.pqTestService.currentExtensionInfos.subscribe(this.handleCurrentExtensionInfoChanged.bind(this));

        // this.pqTestService.currentCredentials.subscribe(
        //     this.handleCurrentExtensionInfoAndCredentialsChanged.bind(this),
        // );

        this.watchMezFileIfNeeded();

        void this.checkAndTryToUpdatePqTest(true);
        void this.promptToSetupCurrentWorkspaceIfNeeded();
    }

    private mezFilesWatcher: FSWatcher | undefined = undefined;
    private debouncedDisplayExtensionInfoCommand: () => Promise<void> = this.commandGuard(
        this.displayExtensionInfoCommand,
        3e3,
    ).bind(this);

    private watchMezFileIfNeeded(): void {
        const currentPQTestExtensionFileLocation: string | undefined =
            ExtensionConfigurations.PQTestExtensionFileLocation;

        const resolvedPQTestExtensionFileLocation: string | undefined = currentPQTestExtensionFileLocation
            ? resolveSubstitutedValues(currentPQTestExtensionFileLocation)
            : undefined;

        if (this.mezFilesWatcher) {
            this.mezFilesWatcher.close();
            this.mezFilesWatcher = undefined;
        }

        if (resolvedPQTestExtensionFileLocation && fs.existsSync(resolvedPQTestExtensionFileLocation)) {
            const theBaseFolder: string = path.dirname(resolvedPQTestExtensionFileLocation);
            const theFileName: string = path.basename(resolvedPQTestExtensionFileLocation);

            this.mezFilesWatcher = fs.watch(
                path.dirname(resolvedPQTestExtensionFileLocation),
                (event: WatchEventType, filename: string) => {
                    // we need not trigger a debounced build from here
                    // b/c in ServiceHost mode, libProvider use a new directory provider everytime before evaluation
                    // thus, we only need to lazily build merely prior our evaluation

                    if (filename === theFileName && event === "change") {
                        void this.debouncedDisplayExtensionInfoCommand();
                    }

                    if (!fs.existsSync(theBaseFolder)) {
                        this.mezFilesWatcher?.close();
                        this.mezFilesWatcher = undefined;

                        setTimeout(() => {
                            this.watchMezFileIfNeeded();
                        }, 1e3);
                    }
                },
            );
        }
    }

    // private handleCurrentExtensionInfoChanged(_extensionInfo: ExtensionInfo[]): void {
    //     void vscode.commands.executeCommand(LifecycleCommands.ListCredentialCommand);
    // }

    // private handleCurrentExtensionInfoAndCredentialsChanged(_credentials: Credential[]): void {
    //     // latter check whether we need to suggest a info msg box and ask users input credentials
    // }

    public async promptToSetupCurrentWorkspaceIfNeeded(): Promise<void> {
        const theFirstWorkspace: vscode.WorkspaceFolder | undefined = getFirstWorkspaceFolder();

        if (theFirstWorkspace && !this.isSuggestingSetupCurrentWorkspace && ExtensionConfigurations.autoDetection) {
            this.isSuggestingSetupCurrentWorkspace = true;
            const anyPqFiles: Uri[] = await getAnyPqFileBeneathTheFirstWorkspace();

            if (
                anyPqFiles.length &&
                !ExtensionConfigurations.PQTestQueryFileLocation &&
                !ExtensionConfigurations.PQTestExtensionFileLocation
            ) {
                const enableStr: string = extensionI18n["PQSdk.common.enable"];

                // we need to suggest setup for newly opened folder
                const result: string | undefined = await vscode.window.showInformationMessage(
                    extensionI18n["PQSdk.lifecycle.prompt.update.workspace"],
                    enableStr,
                    extensionI18n["PQSdk.common.cancel"],
                );

                if (result === enableStr) {
                    void vscode.commands.executeCommand(LifecycleCommands.SetupCurrentWorkspaceCommand);
                }
            }

            this.isSuggestingSetupCurrentWorkspace = false;
        }
    }

    private commandGuard(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cb: (...args: any[]) => Promise<any>,
        debouncedTime: number = 250,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): (...args: any[]) => Promise<any> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return debounce(async (...args: any[]): Promise<any> => {
            let pqTestServiceReady: boolean = this.pqTestService.pqTestReady;

            if (!pqTestServiceReady) {
                const curPqTestPath: string | undefined = await this.checkAndTryToUpdatePqTest();
                pqTestServiceReady = Boolean(curPqTestPath);
            }

            return pqTestServiceReady ? await cb.apply(this, [...args]) : undefined;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }, debouncedTime).bind(this) as (...args: any[]) => Promise<any>;
    }

    public setupCurrentlyOpenedWorkspaceCommand(): void {
        const tasks: Array<Promise<void>> = [];

        let hasPQTestExtensionFileLocation: boolean = false;

        if (ExtensionConfigurations.PQTestExtensionFileLocation) {
            const resolvedPQTestExtensionFileLocation: string | undefined = resolveSubstitutedValues(
                ExtensionConfigurations.PQTestExtensionFileLocation,
            );

            hasPQTestExtensionFileLocation = Boolean(
                resolvedPQTestExtensionFileLocation && fs.existsSync(resolvedPQTestExtensionFileLocation),
            );
        }

        if (!hasPQTestExtensionFileLocation) {
            tasks.push(
                (async (): Promise<void> => {
                    const mezUrlsBeneathBin: Uri[] = await vscWorkspace.findFiles("bin/**/*.{mez}", null, 1);
                    const oldMProjFiles: Uri[] = await vscWorkspace.findFiles("*.{mproj}", null, 1);

                    let mezExtensionPath: string = oldMProjFiles.length
                        ? path.join("${workspaceFolder}", "bin", "Debug", "${workspaceFolderBasename}.mez")
                        : path.join("${workspaceFolder}", "bin", "AnyCPU", "Debug", "${workspaceFolderBasename}.mez");

                    if (mezUrlsBeneathBin.length) {
                        const relativePath: string = vscWorkspace.asRelativePath(mezUrlsBeneathBin[0], false);

                        mezExtensionPath = path.join(
                            "${workspaceFolder}",
                            path.dirname(relativePath),
                            substitutedWorkspaceFolderBasenameIfNeeded(path.basename(relativePath)),
                        );
                    }

                    if (ExtensionConfigurations.PQTestExtensionFileLocation !== mezExtensionPath) {
                        void ExtensionConfigurations.setPQTestExtensionFileLocation(mezExtensionPath);

                        this.outputChannel.appendInfoLine(
                            resolveI18nTemplate("PQSdk.lifecycle.command.set.config", {
                                configName:
                                    ExtensionConstants.ConfigNames.PowerQuerySdk.properties.pqTestExtensionFileLocation,
                                configValue: mezExtensionPath,
                            }),
                        );
                    }
                })(),
            );
        }

        if (!ExtensionConfigurations.PQTestQueryFileLocation) {
            tasks.push(
                (async (): Promise<void> => {
                    const connectorQueryUrls: Uri[] = await vscWorkspace.findFiles("*.{m,pq}", null, 10);

                    for (const uri of connectorQueryUrls) {
                        const theFSPath: string = uri.fsPath;

                        if (theFSPath.indexOf(".m") > -1 || theFSPath.indexOf(".query.pq") > -1) {
                            const relativePath: string = vscWorkspace.asRelativePath(uri, false);

                            const primaryConnQueryLocation: string = path.join(
                                "${workspaceFolder}",
                                path.dirname(relativePath),
                                substitutedWorkspaceFolderBasenameIfNeeded(path.basename(relativePath)),
                            );

                            void ExtensionConfigurations.setPQTestQueryFileLocation(primaryConnQueryLocation);

                            this.outputChannel.appendInfoLine(
                                resolveI18nTemplate("PQSdk.lifecycle.command.set.config", {
                                    configName:
                                        ExtensionConstants.ConfigNames.PowerQuerySdk.properties.pqTestQueryFileLocation,
                                    configValue: primaryConnQueryLocation,
                                }),
                            );

                            break;
                        }
                    }
                })(),
            );
        }

        void Promise.all(tasks);
    }

    private doGenerateOneProjectIntoOneFolderFromTemplates(inputFolder: string, projectName: string): string {
        const folder: string = inputFolder.endsWith(projectName) ? inputFolder : path.join(inputFolder, projectName);

        fs.mkdirSync(folder, { recursive: true });

        const templateTargetFolder: string = path.resolve(this.vscExtCtx.extensionPath, "templates");

        // settings.json
        if (!fs.existsSync(path.join(folder, ".vscode"))) {
            fs.mkdirSync(path.join(folder, ".vscode"));
        }

        fs.copyFileSync(
            path.resolve(templateTargetFolder, "settings.json"),
            path.resolve(folder, ".vscode", "settings.json"),
        );

        // copy pngs
        ["16", "20", "24", "32", "40", "48", "64", "80"].forEach((onePngSize: string) => {
            fs.copyFileSync(
                path.resolve(templateTargetFolder, `${templateFileBaseName}${onePngSize}.png`),
                path.resolve(folder, `${projectName}${onePngSize}.png`),
            );
        });

        // template files
        [
            [`${templateFileBaseName}.proj`, `${projectName}.proj`],
            [`${templateFileBaseName}.pq`, `${projectName}.pq`],
            [`${templateFileBaseName}.query.pq`, `${projectName}.query.pq`],
            ["resources.resx", "resources.resx"],
        ].forEach(([templateFileName, targetFileName]: string[]) => {
            let content: string = fs.readFileSync(path.resolve(templateTargetFolder, templateFileName), {
                encoding: "utf8",
            });

            // we can enhance this part by using a real-template language like handlebars mustache or pug
            content = resolveTemplateSubstitutedValues(content, { ProjectName: projectName });
            fs.writeFileSync(path.resolve(folder, targetFileName), content, { encoding: "utf8" });
        });

        return folder;
    }

    private expectedPqTestPath(maybeNextVersion?: string): string {
        const baseNugetFolder: string = path.resolve(this.vscExtCtx.extensionPath, ExtensionConstants.NugetBaseFolder);

        const pqTestSubPath: string[] = maybeNextVersion
            ? ExtensionConstants.buildPqTestSubPath(maybeNextVersion)
            : ExtensionConstants.PqTestSubPath;

        return path.resolve(baseNugetFolder, ...pqTestSubPath);
    }

    private nugetPqTestExistsSync(maybeNextVersion?: string): boolean {
        const expectedPqTestPath: string = this.expectedPqTestPath(maybeNextVersion);

        return fs.existsSync(expectedPqTestPath);
    }

    private async doListPqTestFromNuget(): Promise<string> {
        await promptWarningMessageForExternalDependency(Boolean(ExtensionConfigurations.nugetPath), true, true);

        // nuget list Microsoft.PowerQuery.SdkTools -ConfigFile ./etc/nuget-staging.config
        const baseNugetFolder: string = path.resolve(this.vscExtCtx.extensionPath, ExtensionConstants.NugetBaseFolder);

        if (!fs.existsSync(baseNugetFolder)) {
            fs.mkdirSync(baseNugetFolder);
        }

        const args: string[] = [
            "list",
            ExtensionConstants.InternalMsftPqSdkToolsNugetName,
            "-ConfigFile",
            path.resolve(this.vscExtCtx.extensionPath, "etc", ExtensionConstants.NugetConfigFileName),
        ];

        const seizingProcess: SpawnedProcess = new SpawnedProcess(ExtensionConfigurations.nugetPath ?? "nuget", args, {
            cwd: baseNugetFolder,
            env: {
                ...process.env,
                FORCE_NUGET_EXE_INTERACTIVE: "true",
            },
        });

        await seizingProcess.deferred$;

        return seizingProcess.stdOut;
    }

    private async doUpdatePqTestFromNuget(maybeNextVersion?: string | undefined): Promise<string | undefined> {
        if (ExtensionConfigurations.nugetPath) {
            // if we got nuget path set, we could seize it from devops feed
            await promptWarningMessageForExternalDependency(Boolean(ExtensionConfigurations.nugetPath), true, true);

            // nuget install Microsoft.PowerQuery.SdkTools -Version  <VERSION_NUMBER> -OutputDirectory .
            // dotnet tool install Microsoft.PowerQuery.SdkTools
            //  --configfile <FILE> --tool-path . --verbosity diag --version
            const baseNugetFolder: string = path.resolve(
                this.vscExtCtx.extensionPath,
                ExtensionConstants.NugetBaseFolder,
            );

            const pqTestFullPath: string = this.expectedPqTestPath(maybeNextVersion);

            if (!fs.existsSync(baseNugetFolder)) {
                fs.mkdirSync(baseNugetFolder);
            }

            const args: string[] = [
                "install",
                ExtensionConstants.InternalMsftPqSdkToolsNugetName,
                "-Version",
                maybeNextVersion ?? ExtensionConstants.SuggestedPqTestNugetVersion,
                "-ConfigFile",
                path.resolve(this.vscExtCtx.extensionPath, "etc", ExtensionConstants.NugetConfigFileName),
                "-OutputDirectory",
                baseNugetFolder,
            ];

            const seizingProcess: SpawnedProcess = new SpawnedProcess(
                ExtensionConfigurations.nugetPath ?? "nuget",
                args,
                {
                    cwd: baseNugetFolder,
                    env: {
                        ...process.env,
                        FORCE_NUGET_EXE_INTERACTIVE: "true",
                    },
                },
                {
                    onStdOut: (data: Buffer): void => {
                        this.outputChannel.appendInfoLine(data.toString("utf8"));
                    },
                    onStdErr: (data: Buffer): void => {
                        this.outputChannel.appendErrorLine(data.toString("utf8"));
                    },
                },
            );

            this.outputChannel.show();

            await seizingProcess.deferred$;

            return fs.existsSync(pqTestFullPath) ? pqTestFullPath : undefined;
        } else {
            // we gonna seize the pqSkdTools from the public feed
            const baseNugetFolder: string = path.resolve(
                this.vscExtCtx.extensionPath,
                ExtensionConstants.NugetBaseFolder,
            );

            const pqTestFullPath: string = this.expectedPqTestPath(maybeNextVersion);

            if (!fs.existsSync(baseNugetFolder)) {
                fs.mkdirSync(baseNugetFolder);
            }

            if (fs.existsSync(pqTestFullPath)) return pqTestFullPath;

            await this.nugetHttpService.downloadAndExtractNugetPackage(
                ExtensionConstants.PublicMsftPqSdkToolsNugetName,
                maybeNextVersion ?? ExtensionConstants.SuggestedPqTestNugetVersion,
                path.join(
                    baseNugetFolder,
                    `${ExtensionConstants.PublicMsftPqSdkToolsNugetName}.${
                        maybeNextVersion ?? ExtensionConstants.SuggestedPqTestNugetVersion
                    }`,
                ),
            );

            return fs.existsSync(pqTestFullPath) ? pqTestFullPath : undefined;
        }
    }

    private async findMaybeNewPqSdkVersion(): Promise<string | undefined> {
        if (ExtensionConfigurations.nugetPath) {
            // we got nuget executable path set, thus we use nuget.exe to query the devops feed
            const pqTestLocation: string | undefined = ExtensionConfigurations.PQTestLocation;
            const curVersion: NugetVersions = NugetVersions.createFromPath(pqTestLocation);

            const latestVersion: NugetVersions = NugetVersions.createFromNugetListOutput(
                await this.doListPqTestFromNuget(),
            );

            const sortedVersions: [NugetVersions, NugetVersions] = [curVersion, latestVersion].sort(
                NugetVersions.compare,
            ) as [NugetVersions, NugetVersions];

            if (!sortedVersions[1].isZero()) {
                // we found a new version, thus we need to check with users first and update to the latest
                return sortedVersions[1].toString();
            } else {
                return undefined;
            }
        } else {
            // we gonna use http endpoint to query the public feed
            const sortedNugetVersions: NugetVersions[] = (
                await this.nugetHttpService.getPackageReleasedVersions(ExtensionConstants.PublicMsftPqSdkToolsNugetName)
            ).versions
                .map((releasedVersion: string) => NugetVersions.createFromReleasedVersionString(releasedVersion))
                .sort(NugetVersions.compare);

            if (sortedNugetVersions.length && !sortedNugetVersions[sortedNugetVersions.length - 1].isZero()) {
                return sortedNugetVersions[sortedNugetVersions.length - 1].toString();
            } else {
                return undefined;
            }
        }
    }

    /**
     * check and only update pqTest if needed like: not ready, not existing, the latest one doesn't exist either
     * @param skipQueryDialog
     * @private
     */
    private async checkAndTryToUpdatePqTest(skipQueryDialog: boolean = false): Promise<string | undefined> {
        let pqTestLocation: string | undefined = ExtensionConfigurations.PQTestLocation;

        const maybeNewVersion: string | undefined = await this.findMaybeNewPqSdkVersion();

        // we should not update to the latest unless the latest nuget doesn't exist on start
        // users might just want to use the previous one purposely
        // therefore do not try to update when, like, pqTestLocation.indexOf(maybeNewVersion) === -1
        if (!pqTestLocation || !this.pqTestService.pqTestReady || !this.nugetPqTestExistsSync(maybeNewVersion)) {
            const pqTestExecutableFullPath: string | undefined = await this.doUpdatePqTestFromNuget(maybeNewVersion);

            if (!pqTestExecutableFullPath && !skipQueryDialog) {
                const pqTestLocationUrls: Uri[] | undefined = await vscode.window.showOpenDialog({
                    openLabel: extensionI18n["PQSdk.lifecycle.warning.pqtest.required"],
                    canSelectFiles: true,
                    canSelectFolders: false,
                    canSelectMany: false,
                    filters: {
                        Executable: ["exe"],
                    },
                });

                if (pqTestLocationUrls?.[0]) {
                    pqTestLocation = pqTestLocationUrls[0].fsPath;
                }
            }

            if (pqTestExecutableFullPath) {
                // convert pqTestLocation of exe to its dirname
                pqTestLocation = path.dirname(pqTestExecutableFullPath);
                const histPqTestLocation: string | undefined = ExtensionConfigurations.PQTestLocation;
                const newPqTestLocation: string = pqTestLocation;

                await ExtensionConfigurations.setPQTestLocation(newPqTestLocation);

                if (histPqTestLocation === newPqTestLocation) {
                    // update the pqtest location by force in case it equals the previous one
                    this.pqTestService.onPowerQueryTestLocationChanged();
                }
            }
        }

        return pqTestLocation;
    }

    /**
     * eagerly update the pqTest as long as currently it is not configured to the latest
     * @param maybeNextVersion
     */
    public async manuallyUpdatePqTest(maybeNextVersion?: string): Promise<string | undefined> {
        if (!maybeNextVersion) {
            maybeNextVersion = await this.findMaybeNewPqSdkVersion();
        }

        let pqTestLocation: string | undefined = ExtensionConfigurations.PQTestLocation;

        // determine whether we should trigger to seize or not
        if (
            !this.nugetPqTestExistsSync(maybeNextVersion) ||
            !pqTestLocation ||
            // when manually update, we should eagerly update as long as current path is not of the latest version
            //  like,
            //      users might want to switch back to the latest some time after
            //      they temporarily switch back to the previous version
            (maybeNextVersion && pqTestLocation.indexOf(maybeNextVersion) === -1)
        ) {
            const pqTestExecutableFullPath: string | undefined = await this.doUpdatePqTestFromNuget(maybeNextVersion);

            if (pqTestExecutableFullPath) {
                pqTestLocation = path.dirname(pqTestExecutableFullPath);
                const histPqTestLocation: string | undefined = ExtensionConfigurations.PQTestLocation;
                const newPqTestLocation: string = pqTestLocation;

                await ExtensionConfigurations.setPQTestLocation(newPqTestLocation);

                if (histPqTestLocation === newPqTestLocation) {
                    // update the pqtest location by force in case it equals the previous one
                    this.pqTestService.onPowerQueryTestLocationChanged();
                }
            }
        }

        // check whether it got seized or not
        if (this.nugetPqTestExistsSync(maybeNextVersion)) {
            const pqTestExecutableFullPath: string = this.expectedPqTestPath(maybeNextVersion);

            this.outputChannel.appendInfoLine(
                resolveI18nTemplate("PQSdk.lifecycle.command.pqtest.seized.from", {
                    pqTestExecutableFullPath,
                }),
            );
        } else {
            this.outputChannel.appendErrorLine(extensionI18n["PQSdk.lifecycle.warning.pqtest.seized.failed"]);
        }

        if (pqTestLocation) {
            this.outputChannel.appendInfoLine(
                resolveI18nTemplate("PQSdk.lifecycle.command.pqtest.set.to", {
                    pqTestLocation: ExtensionConfigurations.PQTestLocation,
                }),
            );
        } else {
            this.outputChannel.appendErrorLine(extensionI18n["PQSdk.lifecycle.warning.pqtest.set.failed"]);
        }

        return pqTestLocation;
    }

    public async generateOneNewProject(): Promise<void> {
        const newProjName: string | undefined = await vscode.window.showInputBox({
            title: extensionI18n["PQSdk.lifecycle.command.new.project.title"],
            placeHolder: extensionI18n["PQSdk.lifecycle.command.new.project.placeHolder"],
            validateInput(value: string): string | Thenable<string | undefined | null> | undefined | null {
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
                // we gotta workspace and let's generate files into the first workspace
                const targetFolder: string = this.doGenerateOneProjectIntoOneFolderFromTemplates(
                    firstWorkspaceFolder.uri.fsPath,
                    newProjName,
                );

                if (targetFolder === firstWorkspaceFolder.uri.fsPath) {
                    // show the info message box telling users that
                    // extension files have been generated for the current folder
                    await vscode.commands.executeCommand(
                        "vscode.open",
                        vscode.Uri.file(path.join(targetFolder, `${newProjName}.pq`)),
                    );

                    void vscode.window.showInformationMessage(
                        resolveI18nTemplate("PQSdk.lifecycle.command.new.project.created", {
                            newProjName,
                            targetFolder,
                        }),
                    );
                } else {
                    // open the sub folder as the current workspace
                    await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(targetFolder));
                }
                //
            } else {
                // we need to open a folder and generate into it
                const selectedFolders: Uri[] | undefined = await vscode.window.showOpenDialog({
                    canSelectMany: false,
                    openLabel: extensionI18n["PQSdk.lifecycle.command.select.workspace"],
                    canSelectFiles: false,
                    canSelectFolders: true,
                });

                if (selectedFolders?.[0].fsPath) {
                    const targetFolder: string = this.doGenerateOneProjectIntoOneFolderFromTemplates(
                        selectedFolders[0].fsPath,
                        newProjName,
                    );

                    await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(targetFolder));
                }
            }
        }
    }

    public async deleteCredentialCommand(): Promise<void> {
        await vscode.window.withProgress(
            {
                title: extensionI18n["PQSdk.lifecycle.command.delete.credentials.title"],
                location: ProgressLocation.Window,
            },
            async (progress: Progress<{ increment?: number; message?: string }>) => {
                progress.report({ increment: 0 });
                this.outputChannel.show();

                try {
                    const result: GenericResult = await this.pqTestService.DeleteCredential();

                    this.outputChannel.appendInfoLine(
                        resolveI18nTemplate("PQSdk.lifecycle.command.delete.credentials.result", {
                            result: prettifyJson(result),
                        }),
                    );
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } catch (error: any | string) {
                    const errorMessage: string = error instanceof Error ? error.message : error;

                    void vscode.window.showErrorMessage(
                        resolveI18nTemplate("PQSdk.lifecycle.command.delete.credentials.errorMessage", {
                            errorMessage,
                        }),
                    );
                }

                progress.report({ increment: 100 });
            },
        );
    }

    public async displayExtensionInfoCommand(): Promise<void> {
        await vscode.window.withProgress(
            {
                title: extensionI18n["PQSdk.lifecycle.command.display.extension.info.title"],
                location: ProgressLocation.Window,
            },
            async (progress: Progress<{ increment?: number; message?: string }>) => {
                progress.report({ increment: 0 });
                this.outputChannel.show();

                try {
                    const result: unknown = await this.pqTestService.DisplayExtensionInfo();

                    this.outputChannel.appendInfoLine(
                        resolveI18nTemplate("PQSdk.lifecycle.command.display.extension.info.result", {
                            result: prettifyJson(result),
                        }),
                    );
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } catch (error: any | string) {
                    const errorMessage: string = error instanceof Error ? error.message : error;

                    void vscode.window.showErrorMessage(
                        resolveI18nTemplate("PQSdk.lifecycle.command.display.extension.info.errorMessage", {
                            errorMessage,
                        }),
                    );
                }

                progress.report({ increment: 100 });
            },
        );
    }

    public async listCredentialCommand(): Promise<void> {
        await vscode.window.withProgress(
            {
                title: extensionI18n["PQSdk.lifecycle.command.list.credentials.title"],
                location: ProgressLocation.Window,
            },
            async (progress: Progress<{ increment?: number; message?: string }>) => {
                progress.report({ increment: 0 });
                this.outputChannel.show();

                try {
                    const result: unknown[] = await this.pqTestService.ListCredentials();

                    this.outputChannel.appendInfoLine(
                        resolveI18nTemplate("PQSdk.lifecycle.command.list.credentials.result", {
                            result: prettifyJson(result),
                        }),
                    );
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } catch (error: any | string) {
                    const errorMessage: string = error instanceof Error ? error.message : error;

                    void vscode.window.showErrorMessage(
                        resolveI18nTemplate("PQSdk.lifecycle.command.list.credentials.errorMessage", {
                            errorMessage,
                        }),
                    );
                }

                progress.report({ increment: 100 });
            },
        );
    }

    private async doPopulateOneSubstitutedValue(
        templateStr: string,
        title: string,
        valueName: string,
        options?: Partial<InputBoxOptions>,
    ): Promise<string> {
        const valueKey: string | undefined = await vscode.window.showInputBox({
            title,
            placeHolder: valueName,
            validateInput(value: string): string | Thenable<string | undefined | null> | undefined | null {
                if (!value) {
                    return resolveI18nTemplate("PQSdk.lifecycle.error.invalid.empty.value", {
                        valueName,
                    });
                }

                return undefined;
            },
            ...options,
        });

        if (valueKey) {
            templateStr = templateStr.replace(valueName, valueKey);
        }

        return templateStr;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async populateCredentialTemplate(template: any): Promise<string> {
        const theAuthenticationKind: AuthenticationKind = template.AuthenticationKind as AuthenticationKind;
        let templateStr: string = JSON.stringify(template);

        switch (theAuthenticationKind) {
            case "Key":
                // $$KEY$$
                templateStr = await this.doPopulateOneSubstitutedValue(
                    templateStr,
                    extensionI18n["PQSdk.lifecycle.credential.key.label"],
                    "$$KEY$$",
                );

                break;
            case "Aad":
            case "OAuth":
                // $$ACCESS_TOKEN$$
                templateStr = await this.doPopulateOneSubstitutedValue(
                    templateStr,
                    extensionI18n["PQSdk.lifecycle.credential.accessToken.label"],
                    "$$ACCESS_TOKEN$$",
                );

                // $$REFRESH_TOKEN$$
                templateStr = await this.doPopulateOneSubstitutedValue(
                    templateStr,
                    extensionI18n["PQSdk.lifecycle.credential.refreshToken.label"],
                    "$$REFRESH_TOKEN$$",
                );

                break;
            case "UsernamePassword":
            case "Windows":
                // $$USERNAME$$
                templateStr = await this.doPopulateOneSubstitutedValue(
                    templateStr,
                    extensionI18n["PQSdk.lifecycle.credential.username.label"],
                    "$$USERNAME$$",
                );

                // $$PASSWORD$$
                templateStr = await this.doPopulateOneSubstitutedValue(
                    templateStr,
                    extensionI18n["PQSdk.lifecycle.credential.password.label"],
                    "$$PASSWORD$$",
                    {
                        password: true,
                    },
                );

                break;
            case "Anonymous":
            default:
                break;
        }

        return templateStr;
    }

    public async generateAndSetCredentialCommand(): Promise<void> {
        await vscode.window.withProgress(
            {
                title: extensionI18n["PQSdk.lifecycle.command.generate.credentials.title"],
                location: ProgressLocation.Window,
            },
            async (progress: Progress<{ increment?: number; message?: string }>) => {
                progress.report({ increment: 0 });
                this.outputChannel.show();

                try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const credentialPayload: any = await this.pqTestService.GenerateCredentialTemplate();

                    this.outputChannel.appendInfoLine(
                        resolveI18nTemplate("PQSdk.lifecycle.command.generate.credentials.result", {
                            result: prettifyJson(credentialPayload),
                        }),
                    );

                    const credentialPayloadStr: string = await this.populateCredentialTemplate(credentialPayload);
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const result: any = await this.pqTestService.SetCredential(credentialPayloadStr);

                    this.outputChannel.appendInfoLine(
                        resolveI18nTemplate("PQSdk.lifecycle.command.set.credentials.result", {
                            result: prettifyJson(result),
                        }),
                    );

                    void vscode.window.showInformationMessage(
                        resolveI18nTemplate("PQSdk.lifecycle.command.set.credentials.info", {
                            authenticationKind: credentialPayload.AuthenticationKind,
                        }),
                    );
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } catch (error: any | string) {
                    const errorMessage: string = error instanceof Error ? error.message : error;

                    void vscode.window.showErrorMessage(
                        resolveI18nTemplate("PQSdk.lifecycle.command.set.credentials.errorMessage", {
                            errorMessage,
                        }),
                    );
                }

                progress.report({ increment: 100 });
            },
        );
    }

    /**
     * Validate createAuthState and return an error message if any
     * @param createAuthState
     */
    public validateCreateAuthState(createAuthState: CreateAuthState): string | undefined {
        if (
            !createAuthState.DataSourceKind ||
            !createAuthState.AuthenticationKind ||
            !createAuthState.PathToQueryFile
        ) {
            return extensionI18n["PQSdk.lifecycle.error.invalid.missing.dataSourceKindAndAuthKind"];
        }

        if (
            createAuthState.AuthenticationKind.toLowerCase() === "usernamepassword" &&
            (!createAuthState.$$PASSWORD$$ || !createAuthState.$$USERNAME$$)
        ) {
            return resolveI18nTemplate("PQSdk.lifecycle.error.invalid.missing.userNameAndPw", {
                authenticationKind: createAuthState.AuthenticationKind,
            });
        }

        if (createAuthState.AuthenticationKind.toLowerCase() === "key" && !createAuthState.$$KEY$$) {
            return resolveI18nTemplate("PQSdk.lifecycle.error.invalid.missing.key", {
                authenticationKind: createAuthState.AuthenticationKind,
            });
        }

        return undefined;
    }

    public async generateAndSetCredentialCommandV2(): Promise<void> {
        const title: string = extensionI18n["PQSdk.lifecycle.command.generate.credentials.title"];

        await vscode.window.withProgress(
            {
                title,
                location: ProgressLocation.Window,
            },
            async (progress: Progress<{ increment?: number; message?: string }>) => {
                progress.report({ increment: 0 });

                try {
                    const currentExtensionInfos: ExtensionInfo[] =
                        this.pqTestService.currentExtensionInfos.value ??
                        (await this.pqTestService.DisplayExtensionInfo());

                    const dataSourceKinds: string[] = Array.from(
                        new Set(
                            currentExtensionInfos
                                .map((oneInfo: ExtensionInfo) =>
                                    oneInfo.DataSources.map(
                                        (oneDataSource: ExtensionInfo["DataSources"][number]) =>
                                            oneDataSource.DataSourceKind,
                                    ),
                                )
                                .flat(),
                        ),
                    );

                    const authenticationKindMap: Map<string, Set<string>> = new Map();

                    currentExtensionInfos.forEach((currentExtensionInfo: ExtensionInfo) => {
                        currentExtensionInfo.DataSources.forEach(
                            (oneDataSource: ExtensionInfo["DataSources"][number]) => {
                                const currentSetOfTheDataSource: Set<string> =
                                    authenticationKindMap.get(oneDataSource.DataSourceKind) ?? new Set();

                                if (!authenticationKindMap.has(oneDataSource.DataSourceKind)) {
                                    authenticationKindMap.set(oneDataSource.DataSourceKind, currentSetOfTheDataSource);
                                }

                                oneDataSource.AuthenticationInfos.forEach(
                                    (
                                        oneAuthInfo: ExtensionInfo["DataSources"][number]["AuthenticationInfos"][number],
                                    ) => {
                                        currentSetOfTheDataSource.add(oneAuthInfo.Kind);
                                    },
                                );
                            },
                        );
                    });

                    const connectorQueryFiles: vscode.Uri[] = await vscode.workspace.findFiles(
                        "**/*.query.pq",
                        "**/{bin,obj}/**",
                        1e2,
                    );

                    // eslint-disable-next-line no-inner-declarations
                    async function collectInputs(): Promise<CreateAuthState> {
                        const state: Partial<CreateAuthState> = {} as Partial<CreateAuthState>;
                        await MultiStepInput.run((input: MultiStepInput) => populateDataSourceKinds(input, state));

                        return state as CreateAuthState;
                    }

                    // eslint-disable-next-line no-inner-declarations
                    async function populateDataSourceKinds(
                        input: MultiStepInput,
                        state: Partial<CreateAuthState>,
                    ): Promise<InputStep | void> {
                        if (dataSourceKinds.length) {
                            const items: vscode.QuickPickItem[] = dataSourceKinds.map((one: string) => ({
                                label: one,
                            }));

                            const picked: vscode.QuickPickItem = await input.showQuickPick({
                                title,
                                step: 1,
                                totalSteps: 3,
                                placeholder: extensionI18n["PQSdk.lifecycle.command.choose.dataSourceKind"],
                                activeItem: items[0],
                                items,
                            });

                            state.DataSourceKind = picked.label;
                        } else {
                            // we did not get a list of data source candidates,
                            // thus have to allow users inputting freely
                            state.DataSourceKind = await input.showInputBox({
                                title,
                                step: 1,
                                totalSteps: 3,
                                value: "",
                                prompt: extensionI18n["PQSdk.lifecycle.command.choose.dataSourceKind.label"],
                                ignoreFocusOut: true,
                                validate: (key: string) =>
                                    Promise.resolve(
                                        key.length
                                            ? undefined
                                            : extensionI18n["PQSdk.lifecycle.error.empty.dataSourceKind"],
                                    ),
                            });
                        }

                        progress.report({ increment: 10 });

                        return (input: MultiStepInput) => populateQueryFile(input, state);
                    }

                    // eslint-disable-next-line no-inner-declarations
                    async function populateQueryFile(
                        input: MultiStepInput,
                        state: Partial<CreateAuthState>,
                    ): Promise<InputStep | void> {
                        const items: vscode.QuickPickItem[] = connectorQueryFiles.map((one: vscode.Uri) => ({
                            label: vscode.workspace.asRelativePath(one),
                            detail: one.fsPath,
                        }));

                        const picked: vscode.QuickPickItem = await input.showQuickPick({
                            title,
                            step: 2,
                            totalSteps: 3,
                            placeholder: extensionI18n["PQSdk.lifecycle.command.choose.connectorFile"],
                            activeItem: items[0],
                            items,
                        });

                        // eslint-disable-next-line require-atomic-updates
                        state.PathToQueryFile = picked.detail;

                        progress.report({ increment: 10 });

                        return (input: MultiStepInput) => pickAuthenticationKind(input, state);
                    }

                    // eslint-disable-next-line no-inner-declarations
                    async function pickAuthenticationKind(
                        input: MultiStepInput,
                        state: Partial<CreateAuthState>,
                    ): Promise<InputStep | void> {
                        let currentAuthCandidates: string[] = state.DataSourceKind
                            ? Array.from(authenticationKindMap.get(state.DataSourceKind) ?? new Set())
                            : [];

                        // ensure we do got a candidate list
                        if (currentAuthCandidates.length === 0) {
                            currentAuthCandidates = ["Anonymous", "Key", "OAuth2", "UsernamePassword", "Windows"];
                        }

                        const items: vscode.QuickPickItem[] = currentAuthCandidates.map((one: string) => ({
                            label: one.toLowerCase() === "implicit" ? "Anonymous" : one,
                        }));

                        const picked: vscode.QuickPickItem = await input.showQuickPick({
                            title,
                            step: 3,
                            totalSteps: 3,
                            placeholder: extensionI18n["PQSdk.lifecycle.command.choose.auth"],
                            activeItem: items[0],
                            items,
                        });

                        // eslint-disable-next-line require-atomic-updates
                        state.AuthenticationKind = picked.label;

                        progress.report({ increment: 10 });

                        // Key / UserNamePassword needs template
                        if (state.AuthenticationKind.toLowerCase() === "key") {
                            return (input: MultiStepInput) => populateKey(input, state);
                        } else if (state.AuthenticationKind.toLowerCase() === "usernamepassword") {
                            return (input: MultiStepInput) => populateUsername(input, state);
                        }
                    }

                    // eslint-disable-next-line no-inner-declarations
                    async function populateKey(
                        input: MultiStepInput,
                        state: Partial<CreateAuthState>,
                    ): Promise<InputStep | void> {
                        // eslint-disable-next-line require-atomic-updates
                        state.$$KEY$$ = await input.showInputBox({
                            title,
                            step: 4,
                            totalSteps: 4,
                            value: "",
                            prompt: extensionI18n["PQSdk.lifecycle.command.choose.authKind.prompt"],
                            ignoreFocusOut: true,
                            validate: (key: string) =>
                                Promise.resolve(
                                    key.length
                                        ? undefined
                                        : resolveI18nTemplate("PQSdk.lifecycle.error.invalid.empty.value", {
                                              valueName: "key",
                                          }),
                                ),
                        });

                        progress.report({ increment: 10 });
                    }

                    // eslint-disable-next-line no-inner-declarations
                    async function populateUsername(
                        input: MultiStepInput,
                        state: Partial<CreateAuthState>,
                    ): Promise<InputStep | void> {
                        // eslint-disable-next-line require-atomic-updates
                        state.$$USERNAME$$ = await input.showInputBox({
                            title,
                            step: 4,
                            totalSteps: 5,
                            value: "",
                            prompt: extensionI18n["PQSdk.lifecycle.credential.username.label"],
                            ignoreFocusOut: true,
                            validate: (username: string) =>
                                Promise.resolve(
                                    username.length
                                        ? undefined
                                        : resolveI18nTemplate("PQSdk.lifecycle.error.invalid.empty.value", {
                                              valueName: "username",
                                          }),
                                ),
                        });

                        progress.report({ increment: 10 });

                        return (input: MultiStepInput) => populatePassword(input, state);
                    }

                    // eslint-disable-next-line no-inner-declarations
                    async function populatePassword(
                        input: MultiStepInput,
                        state: Partial<CreateAuthState>,
                    ): Promise<InputStep | void> {
                        // eslint-disable-next-line require-atomic-updates
                        state.$$PASSWORD$$ = await input.showInputBox({
                            title,
                            step: 5,
                            totalSteps: 5,
                            value: "",
                            ignoreFocusOut: true,
                            prompt: extensionI18n["PQSdk.lifecycle.credential.password.label"],
                            password: true,
                            validate: (_pw: string) => Promise.resolve(undefined),
                        });

                        progress.report({ increment: 10 });
                    }

                    const createAuthState: CreateAuthState = await collectInputs();
                    const maybeErrorMessage: string | undefined = this.validateCreateAuthState(createAuthState);

                    progress.report({ increment: 10 });

                    if (maybeErrorMessage) {
                        void vscode.window.showWarningMessage(maybeErrorMessage);
                    } else {
                        try {
                            const result: GenericResult = await this.pqTestService.SetCredentialFromCreateAuthState(
                                createAuthState,
                            );

                            this.outputChannel.appendInfoLine(
                                resolveI18nTemplate("PQSdk.lifecycle.command.createAuthState.result", {
                                    result: prettifyJson(result),
                                }),
                            );

                            void vscode.window.showInformationMessage(
                                resolveI18nTemplate("PQSdk.lifecycle.command.set.credentials.info", {
                                    authenticationKind: createAuthState.AuthenticationKind,
                                }),
                            );
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        } catch (error: any | string) {
                            const errorMessage: string = error instanceof Error ? error.message : error;

                            void vscode.window.showErrorMessage(
                                resolveI18nTemplate("PQSdk.lifecycle.command.createAuthState.ofKind.errorMessage", {
                                    authenticationKind: createAuthState.AuthenticationKind,
                                    errorMessage,
                                }),
                            );
                        }
                    }
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } catch (error: any | string) {
                    const errorMessage: string = error instanceof Error ? error.message : error;

                    void vscode.window.showErrorMessage(
                        resolveI18nTemplate("PQSdk.lifecycle.command.createAuthState.errorMessage", {
                            errorMessage,
                        }),
                    );
                }

                progress.report({ increment: 100 });
            },
        );
    }

    public async refreshCredentialCommand(): Promise<void> {
        await vscode.window.withProgress(
            {
                title: extensionI18n["PQSdk.lifecycle.credential.refreshToken.label"],
                location: ProgressLocation.Window,
            },
            async (progress: Progress<{ increment?: number; message?: string }>) => {
                progress.report({ increment: 0 });
                this.outputChannel.show();

                try {
                    const result: GenericResult = await this.pqTestService.RefreshCredential();

                    this.outputChannel.appendInfoLine(
                        resolveI18nTemplate("PQSdk.lifecycle.command.refresh.credentials.result", {
                            result: prettifyJson(result),
                        }),
                    );
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } catch (error: any | string) {
                    const errorMessage: string = error instanceof Error ? error.message : error;

                    void vscode.window.showErrorMessage(
                        resolveI18nTemplate("PQSdk.lifecycle.command.refresh.credentials.errorMessage", {
                            errorMessage,
                        }),
                    );
                }

                progress.report({ increment: 100 });
            },
        );
    }

    public async runTestBatteryCommand(pathToQueryFile?: Uri): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let result: any | undefined;

        await vscode.window.withProgress(
            {
                title: extensionI18n["PQSdk.lifecycle.command.run.test.title"],
                location: ProgressLocation.Window,
            },
            async (progress: Progress<{ increment?: number; message?: string }>) => {
                progress.report({ increment: 0 });

                try {
                    if (ExtensionConfigurations.featureUseServiceHost) {
                        result = await (this.pqTestService as PqServiceHostClient).RunTestBatteryFromContent(
                            pathToQueryFile?.fsPath,
                        );
                    } else {
                        result = await this.pqTestService.RunTestBattery(pathToQueryFile?.fsPath);
                    }

                    this.outputChannel.appendInfoLine(
                        resolveI18nTemplate("PQSdk.lifecycle.command.run.test.result", {
                            result: prettifyJson(result),
                        }),
                    );
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } catch (error: any | string) {
                    const errorMessage: string = error instanceof Error ? error.message : error;

                    void vscode.window.showErrorMessage(
                        resolveI18nTemplate("PQSdk.lifecycle.command.run.test.errorMessage", {
                            errorMessage,
                        }),
                    );
                }

                progress.report({ increment: 100 });
            },
        );

        if (result) {
            await vscode.commands.executeCommand(PqTestResultViewPanel.ShowResultWebViewCommand);
            SimplePqTestResultViewBroker.values.latestPqTestResult.emit(result);
        }
    }

    public async testConnectionCommand(): Promise<void> {
        await vscode.window.withProgress(
            {
                title: extensionI18n["PQSdk.lifecycle.command.test.connection.title"],
                location: ProgressLocation.Window,
            },
            async (progress: Progress<{ increment?: number; message?: string }>) => {
                progress.report({ increment: 0 });
                this.outputChannel.show();

                try {
                    const result: GenericResult = await this.pqTestService.TestConnection();

                    this.outputChannel.appendInfoLine(
                        resolveI18nTemplate("PQSdk.lifecycle.command.test.connection.result", {
                            result: prettifyJson(result),
                        }),
                    );
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } catch (error: any | string) {
                    const errorMessage: string = error instanceof Error ? error.message : error;

                    void vscode.window.showErrorMessage(
                        resolveI18nTemplate("PQSdk.lifecycle.command.test.connection.errorMessage", {
                            errorMessage,
                        }),
                    );
                }

                progress.report({ increment: 100 });
            },
        );
    }
}

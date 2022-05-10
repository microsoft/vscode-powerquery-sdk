import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { ExtensionContext, InputBoxOptions, ProgressLocation, Uri, WorkspaceFolder } from "vscode";
import { AuthenticationKind, GenericResult, IPQTestService } from "common/PQTestService";
import PqSdkOutputChannel from "features/PqSdkOutputChannel";
import { prettifyJson, resolveTemplateSubstitutedValues } from "utils/strings";
import { getFirstWorkspaceFolder } from "utils/vscodes";
import { PqTestResultViewPanel, SimplePqTestResultViewBroker } from "panels/PqTestResultViewPanel";
import ExtensionConfigurations from "constants/PowerQuerySdkConfiguration";

const CommandPrefix: string = `powerquery.sdk.pqtest`;

const validateProjectNameRegExp: RegExp = /[A-Za-z]+/;
const templateFileBaseName: string = "PQConn";

export class LifecycleCommands {
    static CreateNewProjectCommand: string = `${CommandPrefix}.CreateNewProjectCommand`;
    static DeleteCredentialCommand: string = `${CommandPrefix}.DeleteCredentialCommand`;
    static DisplayExtensionInfoCommand: string = `${CommandPrefix}.DisplayExtensionInfoCommand`;
    static ListCredentialCommand: string = `${CommandPrefix}.ListCredentialCommand`;
    static GenerateAndSetCredentialCommand: string = `${CommandPrefix}.GenerateAndSetCredentialCommand`;
    static RefreshCredentialCommand: string = `${CommandPrefix}.RefreshCredentialCommand`;
    static RunTestBatteryCommand: string = `${CommandPrefix}.RunTestBatteryCommand`;
    static TestConnectionCommand: string = `${CommandPrefix}.TestConnectionCommand`;

    constructor(
        private readonly vscExtCtx: ExtensionContext,
        private readonly pqTestService: IPQTestService,
        private readonly outputChannel: PqSdkOutputChannel,
    ) {
        vscExtCtx.subscriptions.push(
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
                this.commandGuard(this.generateAndSetCredentialCommand).bind(this),
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
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private commandGuard(cb: (...args: any[]) => Promise<any>) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return async (...args: any[]) => {
            let pqTestServiceReady: boolean = this.pqTestService.pqTestReady;
            if (!pqTestServiceReady) {
                const curPqTestPath: string | undefined = await this.checkAndTryToSeizePQtest();
                pqTestServiceReady = !!curPqTestPath;
            }
            return pqTestServiceReady ? await cb.apply(this, [...args]) : undefined;
        };
    }

    private async doGenerateOneProjectIntoOneFolderFromTemplates(folder: string, projectName: string) {
        const templateTargetFolder: string = path.resolve(this.vscExtCtx.extensionPath, "templates");
        // copy pngs
        ["16", "20", "24", "32", "40", "48", "64", "80"].forEach(onePngSize => {
            fs.copyFileSync(
                path.resolve(templateTargetFolder, `${templateFileBaseName}${onePngSize}.png`),
                path.resolve(folder, `${projectName}${onePngSize}.png`),
            );
        });
        // template files
        [
            [`${templateFileBaseName}.mproj`, `${projectName}.mproj`],
            [`${templateFileBaseName}.pq`, `${projectName}.pq`],
            [`${templateFileBaseName}.query.pq`, `${projectName}.query.pq`],
            ["resources.resx", "resources.resx"],
        ].forEach(([templateFileName, targetFileName]) => {
            let content: string = fs.readFileSync(path.resolve(templateTargetFolder, templateFileName), {
                encoding: "utf8",
            });
            // we can enhance this part by using a real-template language like handlebars mustache or pug
            content = resolveTemplateSubstitutedValues(content, { ProjectName: projectName });
            fs.writeFileSync(path.resolve(folder, targetFileName), content, { encoding: "utf8" });
        });
    }

    private async checkAndTryToSeizePQtest() {
        let pqTestLocation: string | undefined = ExtensionConfigurations.PQTestLocation;
        if (!pqTestLocation || !this.pqTestService.pqTestReady) {
            const pqTestLocationUrls: Uri[] | undefined = await vscode.window.showOpenDialog({
                openLabel: "Before continuing, the pqtest.exe would be required",
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: {
                    Executable: ["exe"],
                },
            });
            // todo need to validate the path of pqtest
            if (pqTestLocationUrls?.[0]) {
                pqTestLocation = pqTestLocationUrls[0].fsPath;
                ExtensionConfigurations.PQTestLocation = path.dirname(pqTestLocation);
            }
        }
        return pqTestLocation;
    }

    public async generateOneNewProject() {
        const pqTestLocation: string | undefined = await this.checkAndTryToSeizePQtest();

        const newProjName: string | undefined = await vscode.window.showInputBox({
            title: "New project name",
            placeHolder: "Only lower cases or upper cases characters are allowed",
            validateInput(value: string): string | Thenable<string | undefined | null> | undefined | null {
                if (!value) {
                    return `Project name cannot be empty.`;
                } else if (!value.match(validateProjectNameRegExp)) {
                    return `Only lower cases or upper cases ch are allowed.`;
                }
                return;
            },
        });

        if (pqTestLocation && newProjName) {
            const firstWorkspaceFolder: WorkspaceFolder | undefined = getFirstWorkspaceFolder();
            if (firstWorkspaceFolder) {
                // we gotta workspace and let's generate files into the first workspace
                await this.doGenerateOneProjectIntoOneFolderFromTemplates(firstWorkspaceFolder.uri.fsPath, newProjName);
            } else {
                // we need to open a folder and generate into it
                const selectedFolders: Uri[] | undefined = await vscode.window.showOpenDialog({
                    canSelectMany: false,
                    openLabel: "Select one workspace to create a new Power Query connector",
                    canSelectFiles: false,
                    canSelectFolders: true,
                });
                if (selectedFolders?.[0].fsPath) {
                    await this.doGenerateOneProjectIntoOneFolderFromTemplates(selectedFolders[0].fsPath, newProjName);
                    vscode.commands.executeCommand("vscode.openFolder", selectedFolders[0]);
                }
            }
        }
    }

    public async deleteCredentialCommand() {
        await vscode.window.withProgress(
            {
                title: "Deleting credentials",
                location: ProgressLocation.Window,
            },
            async progress => {
                progress.report({ increment: 0 });
                this.outputChannel.show();
                const result: GenericResult = await this.pqTestService.DeleteCredential();
                this.outputChannel.appendInfoLine(`DeleteCredential result ${prettifyJson(result)}`);
                progress.report({ increment: 100 });
            },
        );
    }

    public async displayExtensionInfoCommand() {
        await vscode.window.withProgress(
            {
                title: "Displaying extension info",
                location: ProgressLocation.Window,
            },
            async progress => {
                progress.report({ increment: 0 });
                this.outputChannel.show();
                const result: unknown = await this.pqTestService.DisplayExtensionInfo();
                this.outputChannel.appendInfoLine(`DisplayExtensionInfo result ${prettifyJson(result)}`);
                progress.report({ increment: 100 });
            },
        );
    }

    public async listCredentialCommand() {
        await vscode.window.withProgress(
            {
                title: "Listing credentials",
                location: ProgressLocation.Window,
            },
            async progress => {
                progress.report({ increment: 0 });
                this.outputChannel.show();
                const result: unknown[] = await this.pqTestService.ListCredentials();
                this.outputChannel.appendInfoLine(`ListCredentials result ${prettifyJson(result)}`);
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
                    return `Value ${valueName} cannot be empty`;
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
                templateStr = await this.doPopulateOneSubstitutedValue(templateStr, "Credential key", "$$KEY$$");
                break;
            case "Aad":
            case "OAuth2":
                // $$ACCESS_TOKEN$$
                templateStr = await this.doPopulateOneSubstitutedValue(templateStr, "Access token", "$$ACCESS_TOKEN$$");
                // $$REFRESH_TOKEN$$
                templateStr = await this.doPopulateOneSubstitutedValue(
                    templateStr,
                    "Refresh token",
                    "$$REFRESH_TOKEN$$",
                );
                break;
            case "UsernamePassword":
            case "Windows":
                // $$USERNAME$$
                templateStr = await this.doPopulateOneSubstitutedValue(templateStr, "Username", "$$USERNAME$$");
                // $$PASSWORD$$
                templateStr = await this.doPopulateOneSubstitutedValue(templateStr, "password", "$$PASSWORD$$", {
                    password: true,
                });
                break;
            case "Anonymous":
            default:
                break;
        }
        return templateStr;
    }

    public async generateAndSetCredentialCommand() {
        await vscode.window.withProgress(
            {
                title: "Generating one credential",
                location: ProgressLocation.Window,
            },
            async progress => {
                progress.report({ increment: 0 });
                this.outputChannel.show();
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const credentialPayload: any = await this.pqTestService.GenerateCredentialTemplate();
                this.outputChannel.appendInfoLine(
                    `GenerateCredentialTemplate result ${prettifyJson(credentialPayload)}`,
                );
                const credentialPayloadStr: string = await this.populateCredentialTemplate(credentialPayload);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const result: any = await this.pqTestService.SetCredential(credentialPayloadStr);
                this.outputChannel.appendInfoLine(`SetCredential result ${prettifyJson(result)}`);
                await vscode.window.showInformationMessage(
                    `New ${credentialPayload.AuthenticationKind} credential has been generated successfully`,
                );
                progress.report({ increment: 100 });
            },
        );
    }

    public async refreshCredentialCommand() {
        await vscode.window.withProgress(
            {
                title: "Refreshing credentials",
                location: ProgressLocation.Window,
            },
            async progress => {
                progress.report({ increment: 0 });
                this.outputChannel.show();
                const result: GenericResult = await this.pqTestService.RefreshCredential();
                this.outputChannel.appendInfoLine(`RefreshCredential result ${prettifyJson(result)}`);
                progress.report({ increment: 100 });
            },
        );
    }

    public async runTestBatteryCommand(pathToQueryFile?: Uri) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let result: any | undefined;
        await vscode.window.withProgress(
            {
                title: "Running a test",
                location: ProgressLocation.Window,
            },
            async progress => {
                progress.report({ increment: 0 });
                result = await this.pqTestService.RunTestBattery(pathToQueryFile?.fsPath);
                this.outputChannel.appendInfoLine(`RunTestBattery result ${prettifyJson(result)}`);
                // todo we need to show and populate the webview
                progress.report({ increment: 100 });
            },
        );
        if (result) {
            vscode.commands.executeCommand(PqTestResultViewPanel.ShowResultWebViewCommand);
            SimplePqTestResultViewBroker.values.latestPqTestResult.emit(result);
        }
    }

    public async testConnectionCommand() {
        await vscode.window.withProgress(
            {
                title: "Testing the connection",
                location: ProgressLocation.Window,
            },
            async progress => {
                progress.report({ increment: 0 });
                this.outputChannel.show();
                const result: GenericResult = await this.pqTestService.TestConnection();
                this.outputChannel.appendInfoLine(`TestConnection result ${prettifyJson(result)}`);
                progress.report({ increment: 100 });
            },
        );
    }
}

// export default LifecycleCommands;

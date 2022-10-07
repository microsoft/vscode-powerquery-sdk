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
    ExtensionConfigurations,
    promptWarningMessageForExternalDependency,
} from "../../constants/PowerQuerySdkConfiguration";
import { ExtensionConstants } from "../../constants/PowerQuerySdkExtension";
import { NugetVersions } from "../../utils/NugetVersions";
import { PqSdkOutputChannel } from "../../features/PqSdkOutputChannel";
import { SpawnedProcess } from "../SpawnedProcess";

export class NugetCommandService {
    constructor(
        private readonly vscExtCtx: vscode.ExtensionContext,
        private readonly outputChannel?: PqSdkOutputChannel,
    ) {}

    get hasNugetPath(): boolean {
        return Boolean(ExtensionConfigurations.nugetPath);
    }

    private async doListVersionsFromNugetCmd(
        packageName: string = ExtensionConstants.InternalMsftPqSdkToolsNugetName,
        allVersion: boolean = false,
    ): Promise<string> {
        await promptWarningMessageForExternalDependency(Boolean(ExtensionConfigurations.nugetPath), true, true);

        const baseNugetFolder: string = path.resolve(this.vscExtCtx.extensionPath, ExtensionConstants.NugetBaseFolder);

        if (!fs.existsSync(baseNugetFolder)) {
            fs.mkdirSync(baseNugetFolder);
        }

        const args: string[] = ["list", packageName];

        if (allVersion) {
            args.push("-AllVersions");
        }

        if (ExtensionConfigurations.nugetFeed) {
            args.push("-Source", ExtensionConfigurations.nugetFeed);
        }

        const command: string = ExtensionConfigurations.nugetPath ?? "nuget";

        this.outputChannel?.appendDebugLine(`Listing nuget packages using nuget.exe`);
        this.outputChannel?.appendInfoLine(`Running ${command} ${args.join(" ")}`);

        const seizingProcess: SpawnedProcess = new SpawnedProcess(command, args, {
            cwd: baseNugetFolder,
            env: {
                ...process.env,
                FORCE_NUGET_EXE_INTERACTIVE: "true",
            },
        });

        await seizingProcess.deferred$;

        return seizingProcess.stdOut;
    }

    public expectedPackagePath(
        packageName: string = ExtensionConstants.InternalMsftPqSdkToolsNugetName,
        maybeNextVersion: string,
    ): string {
        const baseNugetFolder: string = path.resolve(this.vscExtCtx.extensionPath, ExtensionConstants.NugetBaseFolder);

        const pqTestSubPath: string[] = ExtensionConstants.buildNugetPackageSubPath(packageName, maybeNextVersion);

        return path.resolve(baseNugetFolder, ...pqTestSubPath);
    }

    private async doSeizeFromNugetCmd(
        packageName: string = ExtensionConstants.InternalMsftPqSdkToolsNugetName,
        nextVersion: string,
        baseNugetFolder: string = path.resolve(this.vscExtCtx.extensionPath, ExtensionConstants.NugetBaseFolder),
    ): Promise<string | undefined> {
        // use nuget.exe to check the configured feed location
        await promptWarningMessageForExternalDependency(Boolean(ExtensionConfigurations.nugetPath), true, true);

        const pqTestFullPath: string = this.expectedPackagePath(packageName, nextVersion);

        if (!fs.existsSync(baseNugetFolder)) {
            fs.mkdirSync(baseNugetFolder);
        }

        const args: string[] = [
            "install",
            ExtensionConstants.InternalMsftPqSdkToolsNugetName,
            "-Version",
            nextVersion,
            "-OutputDirectory",
            baseNugetFolder,
        ];

        if (ExtensionConfigurations.nugetFeed) {
            args.push("-Source", ExtensionConfigurations.nugetFeed);
        }

        const command: string = ExtensionConfigurations.nugetPath ?? "nuget";

        this.outputChannel?.appendDebugLine(`Installing nuget packages using nuget.exe`);
        this.outputChannel?.appendInfoLine(`Running ${command} ${args.join(" ")}`);

        const seizingProcess: SpawnedProcess = new SpawnedProcess(
            command,
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
                    this.outputChannel?.appendInfoLine(data.toString("utf8"));
                },
                onStdErr: (data: Buffer): void => {
                    this.outputChannel?.appendErrorLine(data.toString("utf8"));
                },
            },
        );

        await seizingProcess.deferred$;

        return fs.existsSync(pqTestFullPath) ? pqTestFullPath : undefined;
    }

    public async getPackageReleasedVersions(packageName: string): Promise<NugetVersions[]> {
        return NugetVersions.createFromNugetListAllOutput(await this.doListVersionsFromNugetCmd(packageName, true));
    }

    public downloadAndExtractNugetPackage(packageName: string, packageVersion: string): Promise<string | undefined> {
        return this.doSeizeFromNugetCmd(packageName, packageVersion);
    }
}

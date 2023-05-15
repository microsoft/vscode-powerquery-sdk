/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as fs from "fs";
import * as path from "path";
import * as process from "process";

import { assertNotNull } from "../../utils/assertUtils";
import { ExtensionConstants } from "../../constants/PowerQuerySdkExtension";
import { NugetVersions } from "../../utils/NugetVersions";
import type { PqSdkOutputChannel } from "../../features/PqSdkOutputChannel";
import { SpawnedProcess } from "../SpawnedProcess";

export class NugetCommandService {
    constructor(private readonly extensionPath: string, private readonly outputChannel?: PqSdkOutputChannel) {}

    private async doListVersionsFromNugetCmd(
        nugetPath: string = "nuget",
        nugetFeed: string | undefined = undefined,
        packageName: string = ExtensionConstants.InternalMsftPqSdkToolsNugetName,
        allVersion: boolean = false,
    ): Promise<string> {
        const baseNugetFolder: string = path.resolve(this.extensionPath, ExtensionConstants.NugetBaseFolder);

        if (!fs.existsSync(baseNugetFolder)) {
            fs.mkdirSync(baseNugetFolder);
        }

        const args: string[] = ["list", packageName];

        if (allVersion) {
            args.push("-AllVersions");
        }

        if (nugetFeed) {
            args.push("-Source", nugetFeed);
        }

        const command: string = nugetPath ?? "nuget";

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
        const baseNugetFolder: string = path.resolve(this.extensionPath, ExtensionConstants.NugetBaseFolder);

        const pqTestSubPath: string[] = ExtensionConstants.buildNugetPackageSubPath(packageName, maybeNextVersion);

        return path.resolve(baseNugetFolder, ...pqTestSubPath);
    }

    private async doSeizeFromNugetCmd(
        nugetPath: string = "nuget",
        nugetFeed: string | undefined = undefined,
        packageName: string = ExtensionConstants.InternalMsftPqSdkToolsNugetName,
        nextVersion: string,
        baseNugetFolder: string = path.resolve(this.extensionPath, ExtensionConstants.NugetBaseFolder),
    ): Promise<string | undefined> {
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

        if (nugetFeed) {
            args.push("-Source", nugetFeed);
        }

        const command: string = nugetPath ?? "nuget";

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

    public async getPackageReleasedVersions(
        nugetPath: string = "nuget",
        nugetFeed: string | undefined = undefined,
        packageName: string,
    ): Promise<NugetVersions[]> {
        return NugetVersions.createFromNugetListAllOutput(
            await this.doListVersionsFromNugetCmd(nugetPath, nugetFeed, packageName, true),
        );
    }

    public async getSortedPackageReleasedVersions(
        nugetPath: string = "nuget",
        nugetFeed: string | undefined = undefined,
        packageName: string,
        options: {
            maximumNugetVersion?: NugetVersions;
            minimumNugetVersion?: NugetVersions;
        } = {},
    ): Promise<NugetVersions[]> {
        let sortedNugetVersions: NugetVersions[] = (
            await this.getPackageReleasedVersions(nugetPath, nugetFeed, packageName)
        ).sort(NugetVersions.compare);

        if (options.maximumNugetVersion) {
            const maximumNugetVersion: NugetVersions = assertNotNull(options.maximumNugetVersion);

            // filter out any version gt maximumNugetVersion in sortedNugetVersions
            sortedNugetVersions = sortedNugetVersions.filter(
                (one: NugetVersions) => one.compare(maximumNugetVersion) <= 0,
            );
        }

        if (options.minimumNugetVersion) {
            const minimumNugetVersion: NugetVersions = assertNotNull(options.minimumNugetVersion);

            // filter out any version gt maximumNugetVersion in sortedNugetVersions
            sortedNugetVersions = sortedNugetVersions.filter(
                (one: NugetVersions) => minimumNugetVersion.compare(one) <= 0,
            );
        }

        return sortedNugetVersions;
    }

    public downloadAndExtractNugetPackage(
        nugetPath: string = "nuget",
        nugetFeed: string | undefined = undefined,
        packageName: string,
        packageVersion: string,
    ): Promise<string | undefined> {
        return this.doSeizeFromNugetCmd(nugetPath, nugetFeed, packageName, packageVersion);
    }
}

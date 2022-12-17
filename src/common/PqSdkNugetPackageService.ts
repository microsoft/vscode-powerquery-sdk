/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import { GlobalEventBus, GlobalEvents } from "../GlobalEventBus";

import { debounce } from "../utils/debounce";
import { ExtensionConfigurations } from "../constants/PowerQuerySdkConfiguration";
import { ExtensionConstants } from "../constants/PowerQuerySdkExtension";
import { NugetCommandService } from "./nuget/NugetCommandService";
import { NugetHttpService } from "./nuget/NugetHttpService";
import { NugetVersions } from "../utils/NugetVersions";
import { PqSdkOutputChannel } from "../features/PqSdkOutputChannel";

export class PqSdkNugetPackageService {
    private readonly nugetHttpService: NugetHttpService;
    private readonly nugetCommandService: NugetCommandService;
    private readonly nullableMaximumPqTestNugetVersion?: NugetVersions = ExtensionConstants.MaximumPqTestNugetVersion
        ? NugetVersions.createFromFuzzyVersionString(ExtensionConstants.MaximumPqTestNugetVersion)
        : undefined;

    constructor(
        readonly vscExtCtx: vscode.ExtensionContext,
        readonly globalEventBus?: GlobalEventBus,
        readonly outputChannel?: PqSdkOutputChannel,
    ) {
        this.nugetHttpService = new NugetHttpService(outputChannel);
        this.nugetCommandService = new NugetCommandService(vscExtCtx.extensionPath, outputChannel);

        this.globalEventBus?.on(
            GlobalEvents.VSCodeEvents.onProxySettingsChanged,
            debounce(() => {
                this.nugetHttpService.updateAxiosInstance(
                    NugetHttpService.DefaultBaseUrl,
                    ExtensionConfigurations.httpProxy,
                    ExtensionConfigurations.httpProxyAuthorization,
                );
            }, 750).bind(this.nugetHttpService),
        );
    }

    /**
     * Return a list of nuget versions less or equal to `options.maximumNugetVersion` if it got specified
     * Otherwise, return the whole list.
     * @param options
     */
    public async findNullableNewPqSdkVersion(
        options: {
            maximumNugetVersion?: NugetVersions;
        } = {},
    ): Promise<string | undefined> {
        let sortedNugetVersions: NugetVersions[];

        // always restrain the version found beneath the MaximumPqTestNugetVersion
        if (!options.maximumNugetVersion) {
            options.maximumNugetVersion = this.nullableMaximumPqTestNugetVersion;
        }

        if (ExtensionConfigurations.nugetPath) {
            sortedNugetVersions = await this.nugetCommandService.getSortedPackageReleasedVersions(
                ExtensionConfigurations.nugetPath,
                ExtensionConfigurations.nugetFeed,
                ExtensionConstants.PublicMsftPqSdkToolsNugetName,
                options,
            );
        } else {
            // we gonna use http endpoint to query the public feed
            sortedNugetVersions = await this.nugetHttpService.getSortedPackageReleasedVersions(
                ExtensionConstants.PublicMsftPqSdkToolsNugetName,
                options,
            );
        }

        if (sortedNugetVersions.length && !sortedNugetVersions[sortedNugetVersions.length - 1].isZero()) {
            return sortedNugetVersions[sortedNugetVersions.length - 1].toString();
        } else {
            return undefined;
        }
    }

    public expectedPqSdkPath(maybeNextVersion: string | undefined): string {
        return this.nugetCommandService.expectedPackagePath(
            ExtensionConstants.InternalMsftPqSdkToolsNugetName,
            maybeNextVersion || ExtensionConstants.SuggestedPqTestNugetVersion,
        );
    }

    public nugetPqSdkExistsSync(maybeNextVersion?: string): boolean {
        const expectedPqTestPath: string = this.expectedPqSdkPath(maybeNextVersion);

        return fs.existsSync(expectedPqTestPath);
    }

    public async updatePqSdkFromNuget(maybeNextVersion: string | undefined): Promise<string | undefined> {
        const baseNugetFolder: string = path.resolve(this.vscExtCtx.extensionPath, ExtensionConstants.NugetBaseFolder);

        if (!fs.existsSync(baseNugetFolder)) {
            fs.mkdirSync(baseNugetFolder);
        }

        if (ExtensionConfigurations.nugetPath) {
            return this.nugetCommandService.downloadAndExtractNugetPackage(
                ExtensionConfigurations.nugetPath,
                ExtensionConfigurations.nugetFeed,
                ExtensionConstants.InternalMsftPqSdkToolsNugetName,
                maybeNextVersion || ExtensionConstants.SuggestedPqTestNugetVersion,
            );
        } else {
            const pqTestFullPath: string = this.expectedPqSdkPath(maybeNextVersion);

            if (fs.existsSync(pqTestFullPath)) return pqTestFullPath;

            await this.nugetHttpService.downloadAndExtractNugetPackage(
                ExtensionConstants.PublicMsftPqSdkToolsNugetName,
                maybeNextVersion ?? ExtensionConstants.SuggestedPqTestNugetVersion,
                path.join(
                    baseNugetFolder,
                    `${ExtensionConstants.PublicMsftPqSdkToolsNugetName}.${
                        maybeNextVersion || ExtensionConstants.SuggestedPqTestNugetVersion
                    }`,
                ),
            );

            return fs.existsSync(pqTestFullPath) ? pqTestFullPath : undefined;
        }
    }
}

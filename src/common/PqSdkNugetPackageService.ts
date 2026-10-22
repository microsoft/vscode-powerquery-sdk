/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import { ExtensionConfigurations } from "../constants/PowerQuerySdkConfiguration";
import { ExtensionConstants } from "../constants/PowerQuerySdkExtension";
import { PqSdkOutputChannel } from "../features/PqSdkOutputChannel";
import { GlobalEventBus, GlobalEvents } from "../GlobalEventBus";
import { debounce } from "../utils/debounce";
import { nugetPackageProtection } from "../utils/NugetPackageProtection";
import { cleanupNugetPackages } from "../utils/nugetPackageRetention";
import { NugetPackageCleanupInProgressError } from "../utils/nugetPackageUsage";
import { NugetVersions } from "../utils/NugetVersions";
import { NugetCommandService } from "./nuget/NugetCommandService";
import { NugetHttpService } from "./nuget/NugetHttpService";

export class PqSdkNugetPackageService {
    private readonly nugetHttpService: NugetHttpService;
    private readonly nugetCommandService: NugetCommandService;
    private readonly nullableMaximumPqTestNugetVersion?: NugetVersions = ExtensionConstants.MaximumPqTestNugetVersion
        ? NugetVersions.createFromFuzzyVersionString(ExtensionConstants.MaximumPqTestNugetVersion)
        : undefined;
    private readonly nullableMinimumPqTestNugetVersion?: NugetVersions = ExtensionConstants.MinimumPqTestNugetVersion
        ? NugetVersions.createFromFuzzyVersionString(ExtensionConstants.MinimumPqTestNugetVersion)
        : undefined;

    constructor(
        readonly vscExtCtx: vscode.ExtensionContext,
        readonly globalEventBus?: GlobalEventBus,
        readonly outputChannel?: PqSdkOutputChannel,
    ) {
        this.nugetHttpService = new NugetHttpService(outputChannel);
        this.nugetCommandService = new NugetCommandService(vscExtCtx.extensionPath, outputChannel);

        if (outputChannel) {
            nugetPackageProtection.setOutputChannel(outputChannel);
        }

        vscExtCtx.subscriptions.push(nugetPackageProtection);
        this.protectConfiguredPackages();

        vscExtCtx.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration((event: vscode.ConfigurationChangeEvent) => {
                if (event.affectsConfiguration(ExtensionConstants.ConfigNames.PowerQuerySdk.name)) {
                    try {
                        this.protectConfiguredPackages();
                    } catch (error: unknown) {
                        this.outputChannel?.appendErrorLine(`Cannot protect configured SDK packages due to ${error}`);
                    }
                }
            }),
        );

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
     * Otherwise,
     *      return the latest version in `Latest` version tag mode
     *      return the closest version in `Customized` version tag mode
     * @param options
     */
    public async findNullableNewPqSdkVersion(
        options: {
            maximumNugetVersion?: NugetVersions;
            minimumNugetVersion?: NugetVersions;
        } = {},
    ): Promise<string | undefined> {
        let sortedNugetVersions: NugetVersions[];

        if (ExtensionConfigurations.externalsVersionTag === "Recommended") {
            // force limiting the maximum versions of the nuget list result
            if (!options.maximumNugetVersion) {
                // always restrain the version found beneath the MaximumPqTestNugetVersion
                options.maximumNugetVersion = this.nullableMaximumPqTestNugetVersion;
            }

            if (!options.minimumNugetVersion) {
                // always restrain the version found above the MinimumPqTestNugetVersion
                options.minimumNugetVersion = this.nullableMinimumPqTestNugetVersion;
            }
        } else {
            // in other cases, always force returning the whole list of the nuget versions
            options = {};
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

        if (ExtensionConfigurations.externalsVersionTag === "Custom") {
            // need to find the closest version among the result list:
            const expectedNugetVersion: NugetVersions = NugetVersions.createFromFuzzyVersionString(
                ExtensionConfigurations.PQTestVersion || ExtensionConstants.SuggestedPqTestNugetVersion,
            );

            const closestVersion: NugetVersions = NugetVersions.findClosetAmong(
                sortedNugetVersions,
                expectedNugetVersion,
            );

            return closestVersion === NugetVersions.ZERO_VERSION
                ? ExtensionConstants.SuggestedPqTestNugetVersion
                : closestVersion.toString();
        } else if (sortedNugetVersions.length && !sortedNugetVersions[sortedNugetVersions.length - 1].isZero()) {
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

    private protectConfiguredPackages(): string | undefined {
        const baseNugetFolder: string = path.resolve(this.vscExtCtx.extensionPath, ExtensionConstants.NugetBaseFolder);
        let toolsLocation: string | undefined = ExtensionConfigurations.PQTestLocation;

        if (toolsLocation) {
            toolsLocation = nugetPackageProtection.getProtectedLocation(baseNugetFolder, toolsLocation);
        }

        try {
            const directExecutable: string | undefined = ExtensionConfigurations.pqTestExecutablePath;

            if (directExecutable) {
                nugetPackageProtection.getProtectedLocation(baseNugetFolder, path.dirname(directExecutable));
            }
        } catch (error: unknown) {
            if (!(error instanceof NugetPackageCleanupInProgressError)) {
                throw error;
            }

            // The getter has scheduled a retry; initialization waits without exposing this override.
        }

        return toolsLocation;
    }

    public async waitForConfiguredPackages(): Promise<void> {
        this.protectConfiguredPackages();
        await nugetPackageProtection.waitForPending();
    }

    public cleanupUnusedPackages(): Promise<void> {
        return cleanupNugetPackages(
            path.resolve(this.vscExtCtx.extensionPath, ExtensionConstants.NugetBaseFolder),
            this.protectConfiguredPackages(),
            ExtensionConfigurations.numberOfPackagesToKeep,
            this.outputChannel,
        );
    }

    public async updatePqSdkFromNuget(maybeNextVersion: string | undefined): Promise<string | undefined> {
        const baseNugetFolder: string = path.resolve(this.vscExtCtx.extensionPath, ExtensionConstants.NugetBaseFolder);

        if (!fs.existsSync(baseNugetFolder)) {
            fs.mkdirSync(baseNugetFolder);
        }

        if (
            !nugetPackageProtection.getProtectedLocation(
                baseNugetFolder,
                path.dirname(this.expectedPqSdkPath(maybeNextVersion)),
            )
        ) {
            await nugetPackageProtection.waitForPending();
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

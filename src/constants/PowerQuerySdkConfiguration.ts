/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as path from "path";
import * as vscode from "vscode";

import { ExtensionConstants, PqModeType, SdkExternalsVersionTags } from "./PowerQuerySdkExtension";

// eslint-disable-next-line @typescript-eslint/typedef
export const ExtensionConfigurations = {
    get httpProxy(): string | undefined {
        const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration();

        return config.get(ExtensionConstants.ConfigNames.http.proxy);
    },
    get httpProxyAuthorization(): string | undefined {
        const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration();

        return config.get(ExtensionConstants.ConfigNames.http.proxyAuthorization);
    },
    get pqLocale(): string {
        return vscode.env.language.toLowerCase() ?? "en";
    },
    get pqMode(): PqModeType {
        const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(
            ExtensionConstants.ConfigNames.PowerQuery.name,
        );

        return config.get(ExtensionConstants.ConfigNames.PowerQuery.properties.mode) as PqModeType;
    },
    setPqMode(
        mode: PqModeType,
        configurationTarget: vscode.ConfigurationTarget | boolean | null = vscode.ConfigurationTarget.Global,
    ): Thenable<void> {
        const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(
            ExtensionConstants.ConfigNames.PowerQuery.name,
        );

        return config.update(ExtensionConstants.ConfigNames.PowerQuery.properties.mode, mode, configurationTarget);
    },
    setAutoDetection(
        autoDetection: boolean,
        configurationTarget: vscode.ConfigurationTarget | boolean | null = vscode.ConfigurationTarget.Global,
    ): Thenable<void> {
        // we should not cache it
        const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(
            ExtensionConstants.ConfigNames.PowerQuerySdk.name,
        );

        return config.update(
            ExtensionConstants.ConfigNames.PowerQuerySdk.properties.autoDetection,
            autoDetection,
            configurationTarget,
        );
    },
    get autoDetection(): boolean {
        const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(
            ExtensionConstants.ConfigNames.PowerQuerySdk.name,
        );

        const result: boolean | undefined = config.get(
            ExtensionConstants.ConfigNames.PowerQuerySdk.properties.autoDetection,
        );

        return Boolean(result);
    },
    setMsbuildPath(
        msbuildFullPath: string | undefined,
        configurationTarget: vscode.ConfigurationTarget | boolean | null = vscode.ConfigurationTarget.Global,
    ): Thenable<void> {
        // we should not cache it
        const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(
            ExtensionConstants.ConfigNames.PowerQuerySdk.name,
        );

        if (msbuildFullPath && msbuildFullPath.indexOf(ExtensionConstants.MSBuildExecutableName) !== -1) {
            msbuildFullPath = path.dirname(msbuildFullPath);
        }

        return config.update(
            ExtensionConstants.ConfigNames.PowerQuerySdk.properties.externalsMsbuildPath,
            msbuildFullPath,
            configurationTarget,
        );
    },
    get msbuildPath(): string | undefined {
        const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(
            ExtensionConstants.ConfigNames.PowerQuerySdk.name,
        );

        let result: string | undefined = config.get(
            ExtensionConstants.ConfigNames.PowerQuerySdk.properties.externalsMsbuildPath,
        );

        if (result) {
            result = path.join(result, ExtensionConstants.MSBuildExecutableName);
        }

        return result;
    },
    setNugetPath(
        nugetFullPath: string | undefined,
        configurationTarget: vscode.ConfigurationTarget | boolean | null = vscode.ConfigurationTarget.Global,
    ): Thenable<void> {
        // we should not cache it
        const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(
            ExtensionConstants.ConfigNames.PowerQuerySdk.name,
        );

        if (nugetFullPath && nugetFullPath.indexOf(ExtensionConstants.NugetExecutableName) !== -1) {
            nugetFullPath = path.dirname(nugetFullPath);
        }

        return config.update(
            ExtensionConstants.ConfigNames.PowerQuerySdk.properties.externalsNugetPath,
            nugetFullPath,
            configurationTarget,
        );
    },
    get nugetPath(): string | undefined {
        const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(
            ExtensionConstants.ConfigNames.PowerQuerySdk.name,
        );

        let result: string | undefined = config.get(
            ExtensionConstants.ConfigNames.PowerQuerySdk.properties.externalsNugetPath,
        );

        if (result) {
            result = path.join(result, ExtensionConstants.NugetExecutableName);
        }

        return result;
    },

    get nugetFeed(): string | undefined {
        const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(
            ExtensionConstants.ConfigNames.PowerQuerySdk.name,
        );

        return config.get(ExtensionConstants.ConfigNames.PowerQuerySdk.properties.externalsNugetFeed);
    },

    get externalsVersionTag(): SdkExternalsVersionTags {
        const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(
            ExtensionConstants.ConfigNames.PowerQuerySdk.name,
        );

        return config.get(
            ExtensionConstants.ConfigNames.PowerQuerySdk.properties.externalsVersionTag,
        ) as SdkExternalsVersionTags;
    },

    setPQTestLocation(
        pqTestLocation: string | undefined,
        configurationTarget: vscode.ConfigurationTarget | boolean | null = vscode.ConfigurationTarget.Global,
    ): Thenable<void> {
        // we should not cache it
        const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(
            ExtensionConstants.ConfigNames.PowerQuerySdk.name,
        );

        return config.update(
            ExtensionConstants.ConfigNames.PowerQuerySdk.properties.pqTestLocation,
            pqTestLocation,
            configurationTarget,
        );
    },
    get PQTestLocation(): string | undefined {
        // we should not cache it
        const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(
            ExtensionConstants.ConfigNames.PowerQuerySdk.name,
        );

        return (
            config.get(ExtensionConstants.ConfigNames.PowerQuerySdk.properties.pqTestLocation) ??
            // adaptability of a deprecated config item
            config.get(ExtensionConstants.ConfigNames.PowerQuerySdk.properties.deprecatedPqTestLocation)
        );
    },

    setPQTestVersion(
        pqTestVersion: string | undefined,
        configurationTarget: vscode.ConfigurationTarget | boolean | null = vscode.ConfigurationTarget.Global,
    ): Thenable<void> {
        // we should not cache it
        const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(
            ExtensionConstants.ConfigNames.PowerQuerySdk.name,
        );

        return config.update(
            ExtensionConstants.ConfigNames.PowerQuerySdk.properties.pqTestVersion,
            pqTestVersion,
            configurationTarget,
        );
    },
    get PQTestVersion(): string | undefined {
        // we should not cache it
        const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(
            ExtensionConstants.ConfigNames.PowerQuerySdk.name,
        );

        return config.get(ExtensionConstants.ConfigNames.PowerQuerySdk.properties.pqTestVersion);
    },

    setDefaultExtensionLocation(
        PQTestExtensionFileLocation: string,
        configurationTarget: vscode.ConfigurationTarget | boolean = vscode.ConfigurationTarget.Workspace,
    ): Thenable<void> {
        // we should not cache it
        return vscode.workspace
            .getConfiguration()
            .update(
                `${ExtensionConstants.ConfigNames.PowerQuerySdk.name}.${ExtensionConstants.ConfigNames.PowerQuerySdk.properties.defaultExtensionLocation}`,
                PQTestExtensionFileLocation,
                configurationTarget,
            );
    },
    get DefaultExtensionLocation(): string | undefined {
        // we should not cache it
        const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(
            ExtensionConstants.ConfigNames.PowerQuerySdk.name,
        );

        return (
            config?.get(ExtensionConstants.ConfigNames.PowerQuerySdk.properties.defaultExtensionLocation) ??
            // adaptability of a deprecated config item
            config?.get(ExtensionConstants.ConfigNames.PowerQuerySdk.properties.deprecatedPqTestExtensionFileLocation)
        );
    },

    setDefaultQueryFileLocation(
        PQTestQueryFileLocation: string,
        configurationTarget: vscode.ConfigurationTarget | boolean = vscode.ConfigurationTarget.Workspace,
    ): Thenable<void> {
        // we should not cache it
        return vscode.workspace
            .getConfiguration()
            .update(
                `${ExtensionConstants.ConfigNames.PowerQuerySdk.name}.${ExtensionConstants.ConfigNames.PowerQuerySdk.properties.defaultQueryFileLocation}`,
                PQTestQueryFileLocation,
                configurationTarget,
            );
    },
    get DefaultQueryFileLocation(): string | undefined {
        // we should not cache it
        const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(
            ExtensionConstants.ConfigNames.PowerQuerySdk.name,
        );

        return (
            config?.get(ExtensionConstants.ConfigNames.PowerQuerySdk.properties.defaultQueryFileLocation) ??
            // adaptability of a deprecated config item
            config?.get(ExtensionConstants.ConfigNames.PowerQuerySdk.properties.deprecatedPqTestQueryFileLocation)
        );
    },
    get featureUseServiceHost(): boolean {
        const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(
            ExtensionConstants.ConfigNames.PowerQuerySdk.name,
        );

        const result: boolean | undefined = config.get(
            ExtensionConstants.ConfigNames.PowerQuerySdk.properties.featureUseServiceHost,
        );

        return Boolean(result);
    },
};

const NugetDownloadVscUrl: vscode.Uri = vscode.Uri.parse(ExtensionConstants.NugetDownloadUrl);
const MSBuildDownloadVscUrl: vscode.Uri = vscode.Uri.parse(ExtensionConstants.MSBuildDownloadUrl);

export async function promptWarningMessageForExternalDependency(
    hasNugetFromCurConfig: boolean = true,
    hasMsbuildFromCurConfig: boolean = true,
    shouldThrow: boolean = false,
): Promise<void> {
    if (!hasNugetFromCurConfig && !hasMsbuildFromCurConfig) {
        const result: string | undefined = await vscode.window.showWarningMessage(
            "PowerQuery SDK needs msbuild and nuget existing in the path",
            "Download msbuild and nuget",
        );

        if (result) {
            void vscode.commands.executeCommand("vscode.open", MSBuildDownloadVscUrl);
            void vscode.commands.executeCommand("vscode.open", NugetDownloadVscUrl);
        }

        if (shouldThrow) {
            throw new Error("Cannot find MSBuild.exe and Nuget.exe.");
        }
    } else if (!hasNugetFromCurConfig) {
        const result: string | undefined = await vscode.window.showWarningMessage(
            "PowerQuery SDK needs nuget existing in the path",
            "Download nuget",
        );

        if (result) {
            void vscode.commands.executeCommand("vscode.open", NugetDownloadVscUrl);
        }

        if (shouldThrow) {
            throw new Error("Cannot find Nuget.exe.");
        }
    } else if (!hasMsbuildFromCurConfig) {
        const result: string | undefined = await vscode.window.showWarningMessage(
            "PowerQuery SDK needs msbuild existing in the path",
            "Download msbuild",
        );

        if (result) {
            void vscode.commands.executeCommand("vscode.open", MSBuildDownloadVscUrl);
        }

        if (shouldThrow) {
            throw new Error("Cannot find MSBuild.exe.");
        }
    }
}

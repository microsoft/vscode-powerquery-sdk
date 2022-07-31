/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { ConfigurationTarget } from "vscode";

import { ExtensionConstants } from "constants/PowerQuerySdkExtension";
import { findExecutable } from "utils/executables";

// eslint-disable-next-line @typescript-eslint/typedef
export const ExtensionConfigurations = {
    setAutoDetection(
        autoDetection: boolean,
        configurationTarget: ConfigurationTarget | boolean | null = ConfigurationTarget.Global,
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
        configurationTarget: ConfigurationTarget | boolean | null = ConfigurationTarget.Global,
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
        configurationTarget: ConfigurationTarget | boolean | null = ConfigurationTarget.Global,
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
    setPQTestLocation(
        pqTestLocation: string | undefined,
        configurationTarget: ConfigurationTarget | boolean | null = ConfigurationTarget.Global,
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

        return config.get(ExtensionConstants.ConfigNames.PowerQuerySdk.properties.pqTestLocation);
    },

    setPQTestExtensionFileLocation(
        PQTestExtensionFileLocation: string,
        configurationTarget: ConfigurationTarget | boolean = ConfigurationTarget.Workspace,
    ): Thenable<void> {
        // we should not cache it
        return vscode.workspace
            .getConfiguration()
            .update(
                `${ExtensionConstants.ConfigNames.PowerQuerySdk.name}.${ExtensionConstants.ConfigNames.PowerQuerySdk.properties.pqTestExtensionFileLocation}`,
                PQTestExtensionFileLocation,
                configurationTarget,
            );
    },
    get PQTestExtensionFileLocation(): string | undefined {
        // we should not cache it
        const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(
            ExtensionConstants.ConfigNames.PowerQuerySdk.name,
        );

        return config?.get(ExtensionConstants.ConfigNames.PowerQuerySdk.properties.pqTestExtensionFileLocation);
    },

    setPQTestQueryFileLocation(
        PQTestQueryFileLocation: string,
        configurationTarget: ConfigurationTarget | boolean = ConfigurationTarget.Workspace,
    ): Thenable<void> {
        // we should not cache it
        return vscode.workspace
            .getConfiguration()
            .update(
                `${ExtensionConstants.ConfigNames.PowerQuerySdk.name}.${ExtensionConstants.ConfigNames.PowerQuerySdk.properties.pqTestQueryFileLocation}`,
                PQTestQueryFileLocation,
                configurationTarget,
            );
    },
    get PQTestQueryFileLocation(): string | undefined {
        // we should not cache it
        const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(
            ExtensionConstants.ConfigNames.PowerQuerySdk.name,
        );

        return config?.get(ExtensionConstants.ConfigNames.PowerQuerySdk.properties.pqTestQueryFileLocation);
    },
};

const NugetDownloadVscUrl: vscode.Uri = vscode.Uri.parse(ExtensionConstants.NugetDownloadUrl);
const MSBuildDownloadVscUrl: vscode.Uri = vscode.Uri.parse(ExtensionConstants.MSBuildDownloadUrl);

export async function promptWarningMessageForExternalDependency(
    hasNugetFromCurConfig: boolean,
    hasMsbuildFromCurConfig: boolean,
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

export function activateExternalConfiguration(): void {
    // const nugetFromCurConfig: string | undefined = ExtensionConfigurations.nugetPath;
    const msbuildFromCurConfig: string | undefined = ExtensionConfigurations.msbuildPath;
    // let hasNugetFromCurConfig: boolean = Boolean(nugetFromCurConfig && fs.existsSync(nugetFromCurConfig));
    const hasMsbuildFromCurConfig: boolean = Boolean(msbuildFromCurConfig && fs.existsSync(msbuildFromCurConfig));

    // if (!hasNugetFromCurConfig) {
    //     const nugetFromThePath: string | undefined = findExecutable("Nuget", [".exe", ""]);
    //     hasNugetFromCurConfig = Boolean(nugetFromThePath);
    //     void ExtensionConfigurations.setNugetPath(nugetFromThePath);
    // }

    if (!hasMsbuildFromCurConfig) {
        const msbuildFromThePath: string | undefined = findExecutable("MSBuild", [".exe", ""]);
        // hasMsbuildFromCurConfig = Boolean(msbuildFromThePath);
        void ExtensionConfigurations.setMsbuildPath(msbuildFromThePath);
    }
}

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as vscode from "vscode";
import { ConfigurationTarget } from "vscode";
import { ExtensionConstants } from "constants/PowerQuerySdkExtension";

let nugetPath: string | undefined = undefined;

// eslint-disable-next-line @typescript-eslint/typedef
export const ExtensionConfigurations = {
    // in-memory nuget path found while activating
    setNugetPath(nugetFullPath: string | undefined): void {
        nugetPath = nugetFullPath;
    },
    get nugetPath(): string | undefined {
        return nugetPath;
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

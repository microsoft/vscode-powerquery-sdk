/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as vscode from "vscode";
import { ConfigurationTarget } from "vscode";
import { ExtensionConstants } from "constants/PowerQuerySdkExtension";

// eslint-disable-next-line @typescript-eslint/typedef
export const ExtensionConfigurations = {
    setPQTestLocation(pqTestLocation: string | undefined): Thenable<void> {
        // we should not cache it
        const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(
            ExtensionConstants.ConfigNames.PowerQuerySdk.name,
        );

        return config.update(ExtensionConstants.ConfigNames.PowerQuerySdk.properties.pqTestLocation, pqTestLocation);
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

export default ExtensionConfigurations;

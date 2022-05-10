/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as vscode from "vscode";
import { ExtensionConstants } from "constants/PowerQuerySdkExtension";
import { ConfigurationTarget } from "vscode";

// eslint-disable-next-line @typescript-eslint/typedef
export const ExtensionConfigurations = {
    set PQTestLocation(pqTestLocation: string | undefined) {
        // we should not cache it
        const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(
            ExtensionConstants.ConfigNames.PowerQuerySdk.name,
        );
        config.update(ExtensionConstants.ConfigNames.PowerQuerySdk.properties.pqTestLocation, pqTestLocation);
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
        configurationTarget = ConfigurationTarget.Workspace,
    ) {
        // we should not cache it
        vscode.workspace
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
    setPQTestQueryFileLocation(PQTestQueryFileLocation: string, configurationTarget = ConfigurationTarget.Workspace) {
        // we should not cache it
        vscode.workspace
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

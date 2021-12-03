// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { ExtensionSettings } from "./ExtensionSettings";

let currentSettings: ExtensionSettings;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    currentSettings = fetchExtensionSettings();

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    context.subscriptions.push(
        vscode.commands.registerCommand("powerquery.sdk.pqtest.list-credentials", () => {
            vscode.window.showInformationMessage(`PQTest location set to ${currentSettings?.PQTestLocation}`);
        }),
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration("powerquery.sdk")) {
                currentSettings = fetchExtensionSettings();
            }
        }),
    );
}

function fetchExtensionSettings(): ExtensionSettings {
    const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("powerquery.sdk");
    return {
        PQTestLocation: config?.get("pqtest.location") as string,
    };
}

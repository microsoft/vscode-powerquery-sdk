// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { ExtensionSettings } from "./ExtensionSettings";
import { PowerQueryTaskProvider } from "./PowerQueryTaskProvider";

let pqTaskProvider: vscode.Disposable | undefined;
//let currentSettings: ExtensionSettings | undefined;

export function activate(_context: vscode.ExtensionContext) {
    pqTaskProvider = vscode.tasks.registerTaskProvider(
        PowerQueryTaskProvider.TaskType,
        new PowerQueryTaskProvider(fetchExtensionSettings),
    );

    // Listen for configuration changes
    // context.subscriptions.push(
    //     vscode.workspace.onDidChangeConfiguration(event => {
    //         if (event.affectsConfiguration("powerquery.sdk")) {
    //             currentSettings = fetchExtensionSettings();
    //         }
    //     }),
    // );
}

export function deactivate(): void {
    if (pqTaskProvider) {
        pqTaskProvider.dispose();
    }
}

function fetchExtensionSettings(): ExtensionSettings {
    const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("powerquery.sdk");
    return {
        PQTestLocation: config?.get("pqtest.location") as string,
    };
}

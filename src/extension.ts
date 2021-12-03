// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { ExtensionSettings } from "./ExtensionSettings";
import { PQTestTaskProvider } from "./PQTestTaskProvider";

let pqTestTaskProvider: vscode.Disposable | undefined;
//let currentSettings: ExtensionSettings | undefined;

export function activate(_context: vscode.ExtensionContext) {
    pqTestTaskProvider = vscode.tasks.registerTaskProvider(
        PQTestTaskProvider.PQTestType,
        new PQTestTaskProvider(fetchExtensionSettings),
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
    if (pqTestTaskProvider) {
        pqTestTaskProvider.dispose();
    }
}

function fetchExtensionSettings(): ExtensionSettings {
    const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("powerquery.sdk");
    return {
        PQTestLocation: config?.get("pqtest.location") as string,
    };
}

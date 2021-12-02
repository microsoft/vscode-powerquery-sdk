// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { Configuration } from "./Configuration";

let currentConfigruation: Configuration;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "powerquery-sdk" is now active!');

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    context.subscriptions.push(
        vscode.commands.registerCommand("powerquery-sdk.helloWorld", () => {
            // The code you place here will be executed every time your command is executed
            // Display a message box to the user
            vscode.window.showInformationMessage(`PQTest location set to ${currentConfigruation?.PQTestLocation}`);
        }),
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration("powerquery.sdk")) {
                const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("powerquery.sdk");
                currentConfigruation = {
                    PQTestLocation: config?.get("pqtest.location") as string,
                };
            }
        }),
    );
}

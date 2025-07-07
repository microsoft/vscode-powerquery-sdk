/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as vscode from "vscode";

/**
 * Abstraction for VS Code UI interactions to enable testing
 */
export interface IUIService {
    /**
     * Show input box for user input
     */
    showInputBox(options: vscode.InputBoxOptions): Promise<string | undefined>;

    /**
     * Show quick pick for user selection
     */
    showQuickPick<T extends vscode.QuickPickItem>(
        items: T[] | Thenable<T[]>,
        options?: vscode.QuickPickOptions,
    ): Promise<T | undefined>;

    /**
     * Show information message
     */
    showInformationMessage(message: string, ...items: string[]): Promise<string | undefined>;

    /**
     * Show warning message
     */
    showWarningMessage(message: string, ...items: string[]): Promise<string | undefined>;

    /**
     * Show error message
     */
    showErrorMessage(message: string, ...items: string[]): Promise<string | undefined>;

    /**
     * Show open dialog for file/folder selection
     */
    showOpenDialog(options: vscode.OpenDialogOptions): Promise<vscode.Uri[] | undefined>;

    /**
     * Show save dialog for file saving
     */
    showSaveDialog(options: vscode.SaveDialogOptions): Promise<vscode.Uri | undefined>;

    /**
     * Show progress dialog with task execution
     */
    withProgress<R>(
        options: vscode.ProgressOptions,
        task: (progress: vscode.Progress<{ message?: string; increment?: number }>) => Thenable<R>,
    ): Promise<R>;
}

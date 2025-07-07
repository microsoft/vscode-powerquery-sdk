/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as vscode from "vscode";

import type { IUIService } from "../testing/abstractions/IUIService";

/**
 * Concrete implementation of IUIService using VS Code APIs
 */
export class UIService implements IUIService {
    /**
     * Show input box for user input
     */
    async showInputBox(options: vscode.InputBoxOptions): Promise<string | undefined> {
        const result: string | undefined = await vscode.window.showInputBox(options);

        return result;
    }

    /**
     * Show quick pick for user selection
     */
    async showQuickPick<T extends vscode.QuickPickItem>(
        items: T[] | Thenable<T[]>,
        options?: vscode.QuickPickOptions,
    ): Promise<T | undefined> {
        const result: T | undefined = await vscode.window.showQuickPick(items, options);

        return result;
    }

    /**
     * Show information message
     */
    async showInformationMessage(message: string, ...items: string[]): Promise<string | undefined> {
        const result: string | undefined = await vscode.window.showInformationMessage(message, ...items);

        return result;
    }

    /**
     * Show warning message
     */
    async showWarningMessage(message: string, ...items: string[]): Promise<string | undefined> {
        const result: string | undefined = await vscode.window.showWarningMessage(message, ...items);

        return result;
    }

    /**
     * Show error message
     */
    async showErrorMessage(message: string, ...items: string[]): Promise<string | undefined> {
        const result: string | undefined = await vscode.window.showErrorMessage(message, ...items);

        return result;
    }

    /**
     * Show open dialog for file/folder selection
     */
    async showOpenDialog(options: vscode.OpenDialogOptions): Promise<vscode.Uri[] | undefined> {
        const result: vscode.Uri[] | undefined = await vscode.window.showOpenDialog(options);

        return result;
    }

    /**
     * Show save dialog for file saving
     */
    async showSaveDialog(options: vscode.SaveDialogOptions): Promise<vscode.Uri | undefined> {
        const result: vscode.Uri | undefined = await vscode.window.showSaveDialog(options);

        return result;
    }

    /**
     * Show progress dialog with task execution
     */
    async withProgress<R>(
        options: vscode.ProgressOptions,
        task: (progress: vscode.Progress<{ message?: string; increment?: number }>) => Thenable<R>,
    ): Promise<R> {
        const result: R = await vscode.window.withProgress(options, task);

        return result;
    }
}

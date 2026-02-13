/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as vscode from "vscode";

// ============================================================================
// Testability Interfaces for VS Code File System API
// ============================================================================

/**
 * Interface for file system operations using VS Code's workspace API.
 * Allows for dependency injection and easier unit testing.
 */
export interface FileSystemOperations {
    readFile(uri: vscode.Uri): Thenable<Uint8Array>;
    stat(uri: vscode.Uri): Thenable<vscode.FileStat>;
}

/**
 * Interface for workspace operations.
 * Allows for dependency injection and easier unit testing.
 */
export interface WorkspaceOperations {
    workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined;
}

/**
 * Default implementations using VS Code APIs.
 */
export const defaultFileSystemOperations: FileSystemOperations = vscode.workspace.fs;
export const defaultWorkspaceOperations: WorkspaceOperations = vscode.workspace;

// ============================================================================
// VS Code workspace.fs-based Utilities (async, workspace-aware)
// ============================================================================

/**
 * Checks if a file exists using VS Code's file system API (async).
 *
 * @param filePath Absolute path to the file
 * @param fs File system operations (defaults to VS Code's workspace.fs)
 * @returns Promise that resolves to true if file exists, false otherwise
 */
export async function fileExists(
    filePath: string,
    fs: FileSystemOperations = defaultFileSystemOperations,
): Promise<boolean> {
    try {
        await fs.stat(vscode.Uri.file(filePath));
        return true;
    } catch {
        return false;
    }
}

/**
 * Determines if a path is a file, directory, or doesn't exist.
 * Uses VS Code's file system API for workspace compatibility.
 *
 * @param filePath Absolute path to check
 * @param fs File system operations (defaults to VS Code's workspace.fs)
 * @returns Promise resolving to 'file', 'directory', or 'not-found'
 */
export async function getPathType(
    filePath: string,
    fs: FileSystemOperations = defaultFileSystemOperations,
): Promise<"file" | "directory" | "not-found"> {
    try {
        const fileStat: vscode.FileStat = await fs.stat(vscode.Uri.file(filePath));

        if (fileStat.type === vscode.FileType.Directory) {
            return "directory";
        } else {
            return "file";
        }
    } catch (e) {
        if (e instanceof vscode.FileSystemError && (e.code === "FileNotFound" || e.code === "ENOENT")) {
            return "not-found";
        }
        // Re-throw other errors (permissions, network issues, etc.)
        throw e;
    }
}

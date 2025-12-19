/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as fs from "fs";
import * as path from "path";
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
// Node.js fs-based Utilities (synchronous, direct file system access)
// ============================================================================

const defaultMatcher: (_: string) => boolean = () => true;

export async function* globFiles(
    dir: string,
    matcher: (path: string) => boolean = defaultMatcher,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
): AsyncGenerator<string, any, void> {
    if (!fs.existsSync(dir)) return;

    const dirents: fs.Dirent[] = await fs.promises.readdir(dir, { withFileTypes: true });

    for (const dirent of dirents) {
        const currentFullPath: string = path.resolve(dir, dirent.name);

        if (dirent.isDirectory()) {
            yield* globFiles(currentFullPath, matcher);
        } else if (matcher(currentFullPath)) {
            yield currentFullPath;
        }
    }
}

export function removeDirectoryRecursively(directoryFullName: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Promise<void>((resolve: () => void, reject: (reason?: any) => void) => {
        fs.rm(directoryFullName, { recursive: true, force: true }, (err: NodeJS.ErrnoException | null) => {
            if (err) {
                reject(err);

                return;
            }

            resolve();
        });
    });
}

export function tryRemoveDirectoryRecursively(directoryFullName: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Promise<void>((resolve: () => void, _reject: (reason?: any) => void) => {
        fs.rm(directoryFullName, { recursive: true, force: true }, (_err: NodeJS.ErrnoException | null) => {
            resolve();
        });
    });
}

// The timestamp indicating the last time the file status was changed.
export function getMtimeOfAFile(fileFullPath: string): Date {
    if (fs.existsSync(fileFullPath)) {
        const fileStats: fs.Stats = fs.statSync(fileFullPath);

        // ctime: The timestamp indicating the last time the file status was changed.
        // mtime: The timestamp indicating the last time this file was modified.
        // so we should use mtime over here.
        return fileStats.mtime;
    }

    return new Date(0);
}

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

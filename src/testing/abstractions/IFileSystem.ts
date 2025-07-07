/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

/**
 * Abstraction for file system operations to enable testing
 */
export interface IFileSystem {
    /**
     * Check if a file or directory exists
     */
    exists(path: string): Promise<boolean>;

    /**
     * Read file content as string
     */
    readFile(path: string): Promise<string>;

    /**
     * Write string content to file
     */
    writeFile(path: string, content: string): Promise<void>;

    /**
     * Write JSON object to file
     */
    writeJson(path: string, data: unknown): Promise<void>;

    /**
     * Create directory (recursive)
     */
    createDirectory(path: string): Promise<void>;

    /**
     * Get file modification time
     */
    getModifiedTime(path: string): Promise<Date>;

    /**
     * Delete file
     */
    deleteFile(path: string): Promise<void>;

    /**
     * List directory contents
     */
    readDirectory(path: string): Promise<string[]>;
}

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as fs from "fs";
import * as path from "path";

import type { IFileSystem } from "../testing/abstractions/IFileSystem";

/**
 * Concrete implementation of IFileSystem using VS Code and Node.js APIs
 */
export class FileSystemService implements IFileSystem {
    /**
     * Check if a file or directory exists
     */
    async exists(filePath: string): Promise<boolean> {
        try {
            await fs.promises.access(filePath);

            return true;
        } catch {
            return false;
        }
    }

    /**
     * Check if a file or directory exists (synchronous)
     */
    existsSync(filePath: string): boolean {
        return fs.existsSync(filePath);
    }

    /**
     * Read file content as string
     */
    async readFile(filePath: string): Promise<string> {
        const content: string = await fs.promises.readFile(filePath, "utf8");

        return content;
    }

    /**
     * Read file content as string (synchronous)
     */
    readFileSync(filePath: string, _options?: { encoding: string }): string {
        // For simplicity, always use utf8 encoding
        return fs.readFileSync(filePath, "utf8");
    }

    /**
     * Write string content to file
     */
    async writeFile(filePath: string, content: string): Promise<void> {
        // Ensure directory exists
        const dir: string = path.dirname(filePath);

        await this.createDirectory(dir);

        await fs.promises.writeFile(filePath, content, "utf8");
    }

    /**
     * Write string content to file (synchronous)
     */
    writeFileSync(filePath: string, content: string, _options?: { encoding: string }): void {
        // Ensure directory exists
        const dir: string = path.dirname(filePath);

        fs.mkdirSync(dir, { recursive: true });

        // For simplicity, always use utf8 encoding
        fs.writeFileSync(filePath, content, "utf8");
    }

    /**
     * Write JSON object to file
     */
    async writeJson(filePath: string, data: unknown): Promise<void> {
        const jsonContent: string = JSON.stringify(data, null, 2);

        await this.writeFile(filePath, jsonContent);
    }

    /**
     * Create directory (recursive, synchronous)
     */
    mkdirSync(dirPath: string, options?: { recursive?: boolean }): void {
        fs.mkdirSync(dirPath, options);
    }

    /**
     * Copy file (synchronous)
     */
    copyFileSync(src: string, dest: string): void {
        fs.copyFileSync(src, dest);
    }

    /**
     * Create directory (recursive)
     */
    async createDirectory(dirPath: string): Promise<void> {
        await fs.promises.mkdir(dirPath, { recursive: true });
    }

    /**
     * Get file modification time
     */
    async getModifiedTime(filePath: string): Promise<Date> {
        const stats: fs.Stats = await fs.promises.stat(filePath);

        return stats.mtime;
    }

    /**
     * Delete file
     */
    async deleteFile(filePath: string): Promise<void> {
        await fs.promises.unlink(filePath);
    }

    /**
     * List directory contents
     */
    async readDirectory(dirPath: string): Promise<string[]> {
        const items: string[] = await fs.promises.readdir(dirPath);

        return items;
    }
}

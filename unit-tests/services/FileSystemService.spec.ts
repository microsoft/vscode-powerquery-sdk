/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { afterEach, beforeEach, describe, it } from "mocha";
import { expect } from "chai";

import { FileSystemService } from "../../src/services/FileSystemService";

describe("FileSystemService", () => {
    let fileSystemService: FileSystemService;
    let tempDir: string;

    beforeEach(async () => {
        fileSystemService = new FileSystemService();
        tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pq-sdk-test-"));
    });

    afterEach(async () => {
        // Clean up temp directory
        if (tempDir) {
            await fs.promises.rm(tempDir, { recursive: true, force: true });
        }
    });

    describe("exists", () => {
        it("should return true for existing file", async () => {
            const testFile = path.join(tempDir, "test.txt");

            await fs.promises.writeFile(testFile, "test content");

            const result = await fileSystemService.exists(testFile);

            expect(result).to.equal(true);
        });

        it("should return false for non-existing file", async () => {
            const testFile = path.join(tempDir, "nonexistent.txt");

            const result = await fileSystemService.exists(testFile);

            expect(result).to.equal(false);
        });
    });

    describe("readFile", () => {
        it("should read file content correctly", async () => {
            const testFile = path.join(tempDir, "test.txt");
            const testContent = "Hello, world!";

            await fs.promises.writeFile(testFile, testContent);

            const result = await fileSystemService.readFile(testFile);

            expect(result).to.equal(testContent);
        });

        it("should throw error for non-existing file", async () => {
            const testFile = path.join(tempDir, "nonexistent.txt");

            try {
                await fileSystemService.readFile(testFile);
                expect.fail("Should have thrown an error");
            } catch (error) {
                expect(error).to.be.instanceOf(Error);
            }
        });
    });

    describe("writeFile", () => {
        it("should write file content correctly", async () => {
            const testFile = path.join(tempDir, "test.txt");
            const testContent = "Hello, world!";

            await fileSystemService.writeFile(testFile, testContent);

            const actualContent = await fs.promises.readFile(testFile, "utf8");

            expect(actualContent).to.equal(testContent);
        });

        it("should create directories if they don't exist", async () => {
            const subDir = path.join(tempDir, "sub", "nested");
            const testFile = path.join(subDir, "test.txt");
            const testContent = "Hello, world!";

            await fileSystemService.writeFile(testFile, testContent);

            const actualContent = await fs.promises.readFile(testFile, "utf8");

            expect(actualContent).to.equal(testContent);
        });
    });

    describe("writeJson", () => {
        it("should write JSON object correctly", async () => {
            const testFile = path.join(tempDir, "test.json");
            const testData = { name: "test", value: 42 };

            await fileSystemService.writeJson(testFile, testData);

            const actualContent = await fs.promises.readFile(testFile, "utf8");
            const actualData = JSON.parse(actualContent);

            expect(actualData).to.deep.equal(testData);
        });
    });

    describe("createDirectory", () => {
        it("should create directory successfully", async () => {
            const testDir = path.join(tempDir, "newdir");

            await fileSystemService.createDirectory(testDir);

            const stats = await fs.promises.stat(testDir);

            expect(stats.isDirectory()).to.equal(true);
        });

        it("should create nested directories", async () => {
            const testDir = path.join(tempDir, "level1", "level2", "level3");

            await fileSystemService.createDirectory(testDir);

            const stats = await fs.promises.stat(testDir);

            expect(stats.isDirectory()).to.equal(true);
        });
    });

    describe("getModifiedTime", () => {
        it("should return file modification time", async () => {
            const testFile = path.join(tempDir, "test.txt");

            await fs.promises.writeFile(testFile, "test content");

            const result = await fileSystemService.getModifiedTime(testFile);

            expect(result).to.be.instanceOf(Date);
            expect(result.getTime()).to.be.closeTo(Date.now(), 5000); // Within 5 seconds
        });
    });

    describe("deleteFile", () => {
        it("should delete file successfully", async () => {
            const testFile = path.join(tempDir, "test.txt");

            await fs.promises.writeFile(testFile, "test content");

            expect(await fileSystemService.exists(testFile)).to.equal(true);

            await fileSystemService.deleteFile(testFile);

            expect(await fileSystemService.exists(testFile)).to.equal(false);
        });
    });

    describe("readDirectory", () => {
        it("should list directory contents", async () => {
            const files = ["file1.txt", "file2.txt", "file3.txt"];

            await Promise.all(files.map((file: string) => fs.promises.writeFile(path.join(tempDir, file), "content")));

            const result = await fileSystemService.readDirectory(tempDir);

            expect(result).to.have.lengthOf(files.length);

            for (const file of files) {
                expect(result).to.include(file);
            }
        });
    });
});

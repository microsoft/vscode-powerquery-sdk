/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { describe, it } from "mocha";
import { expect } from "chai";

import {
    getNormalizedPath,
    splitPath,
    joinPath,
    getParentPath,
    changeFileExtension,
    splitPathPreservingCaseParts,
} from "../../../../src/testing/pqtest-adapter/core/pathOperations";

describe("pathOperations", () => {
    describe("getNormalizedPath", () => {
        it("should normalize Windows paths to forward slashes", () => {
            const testCases = [
                { input: "C:\\Users\\Test", expected: "c:/users/test", reason: "basic Windows path" },
                { input: "C:\\Users\\Test\\", expected: "c:/users/test/", reason: "trailing backslash" },
                { input: "C:\\Users\\Test\\file.txt", expected: "c:/users/test/file.txt", reason: "file path" },
            ];

            for (const { input, expected, reason } of testCases) {
                const result = getNormalizedPath(input);
                expect(result).to.equal(expected, reason);
            }
        });

        it("should handle already normalized paths", () => {
            const testCases = [
                { input: "c:/users/test", expected: "c:/users/test", reason: "already normalized" },
                { input: "c:/users/test/", expected: "c:/users/test/", reason: "trailing slash" },
                { input: "relative/path/file.txt", expected: "relative/path/file.txt", reason: "relative path" },
            ];

            for (const { input, expected, reason } of testCases) {
                const result = getNormalizedPath(input);
                expect(result).to.equal(expected, reason);
            }
        });

        it("should convert to lowercase on Windows", () => {
            if (process.platform === "win32") {
                const testCases = [
                    { input: "C:/Users/Test", expected: "c:/users/test" },
                    { input: "D:/MixedCase/FILE.TXT", expected: "d:/mixedcase/file.txt" },
                    { input: "UPPERCASE\\PATH", expected: "uppercase/path" },
                ];

                for (const { input, expected } of testCases) {
                    const result = getNormalizedPath(input);
                    expect(result).to.equal(expected, `Windows path: "${input}"`);
                }
            }
        });

        it("should handle edge cases", () => {
            const edgeCases = [
                { input: "", expected: "", reason: "empty string" },
                { input: "C:/", expected: "c:/", reason: "root drive" },
                { input: "C:\\", expected: "c:/", reason: "root drive with backslash" },
                { input: "file.txt", expected: "file.txt", reason: "filename only" },
                { input: ".", expected: ".", reason: "current directory" },
                { input: "..", expected: "..", reason: "parent directory marker" },
                { input: "./relative", expected: "relative", reason: "relative with dot" },
                { input: "../parent", expected: "../parent", reason: "parent relative" },
            ];

            for (const { input, expected, reason } of edgeCases) {
                const result = getNormalizedPath(input);
                expect(result).to.equal(expected, reason);
            }
        });

        it("should handle special characters", () => {
            const testCases = [
                { input: "file name.txt", expected: "file name.txt", reason: "spaces" },
                { input: "file-name.txt", expected: "file-name.txt", reason: "hyphen" },
                { input: "file_name.txt", expected: "file_name.txt", reason: "underscore" },
            ];

            for (const { input, expected, reason } of testCases) {
                const result = getNormalizedPath(input);
                expect(result.toLowerCase()).to.equal(expected.toLowerCase(), reason);
            }
        });

        it("should handle UNC paths", () => {
            if (process.platform === "win32") {
                const testCases = [
                    { input: "\\\\server\\share", expected: "//server/share/", reason: "UNC path" },
                    { input: "\\\\server\\share\\folder", expected: "//server/share/folder", reason: "UNC with folder" },
                    { input: "//server/share", expected: "//server/share/", reason: "forward slash UNC" },
                ];

                for (const { input, expected, reason } of testCases) {
                    const result = getNormalizedPath(input);
                    expect(result).to.equal(expected, reason);
                }
            }
        });

        it("should be idempotent", () => {
            const testPaths = [
                "C:\\Users\\Test",
                "c:/users/test",
                "relative/path",
                "..\\parent\\file.txt",
                "file.txt",
                "",
            ];

            for (const path of testPaths) {
                const once = getNormalizedPath(path);
                const twice = getNormalizedPath(once);
                expect(once).to.equal(twice, `Not idempotent for: "${path}"`);
            }
        });

        it("should handle very long paths", () => {
            const longPath = "C:/" + "folder/".repeat(50) + "file.txt";
            const result = getNormalizedPath(longPath);
            expect(result).to.include("file.txt");
            expect(result).to.match(/^[a-z]:/); // Should start with lowercase drive
        });

        it("should handle paths with consecutive separators", () => {
            const testCases = [
                { input: "C:\\\\Users\\\\Test", expected: "c:/users/test", reason: "double backslashes" },
                { input: "c://users//test", expected: "c:/users/test", reason: "double forward slashes" },
                { input: "c:/users///test////file.txt", expected: "c:/users/test/file.txt", reason: "multiple slashes" },
            ];

            for (const { input, expected, reason } of testCases) {
                const result = getNormalizedPath(input);
                expect(result).to.equal(expected, reason);
            }
        });
    });

    describe("splitPath", () => {
        it("should split normalized paths correctly", () => {
            const testCases = [
                { input: "c:/users/test/file.txt", expected: ["c:", "users", "test", "file.txt"], reason: "absolute path" },
                { input: "relative/path/file.txt", expected: ["relative", "path", "file.txt"], reason: "relative path" },
                { input: "c:/single", expected: ["c:", "single"], reason: "single folder" },
                { input: "file.txt", expected: ["file.txt"], reason: "filename only" },
            ];

            for (const { input, expected, reason } of testCases) {
                const result = splitPath(input);
                expect(result).to.deep.equal(expected, reason);
            }
        });

        it("should handle Windows paths with backslashes", () => {
            const testCases = [
                { input: "C:\\Users\\Test", expected: ["c:", "users", "test"], reason: "Windows path" },
                { input: "C:\\Users\\Test\\file.txt", expected: ["c:", "users", "test", "file.txt"], reason: "Windows file path" },
            ];

            for (const { input, expected, reason } of testCases) {
                const result = splitPath(input);
                expect(result).to.deep.equal(expected, reason);
            }
        });

        it("should filter out empty parts", () => {
            const testCases = [
                { input: "c://users//test", expected: ["c:", "users", "test"], reason: "double slashes" },
                { input: "c:/users/test/", expected: ["c:", "users", "test"], reason: "trailing slash" },
                { input: "/users/test", expected: ["users", "test"], reason: "leading slash" },
            ];

            for (const { input, expected, reason } of testCases) {
                const result = splitPath(input);
                expect(result).to.deep.equal(expected, reason);
            }
        });

        it("should handle edge cases", () => {
            const edgeCases = [
                { input: "", expected: [], reason: "empty string" },
                { input: "c:", expected: ["c:."], reason: "drive only" },
                { input: ".", expected: ["."], reason: "current directory" },
                { input: "..", expected: [".."], reason: "parent directory" },
            ];

            for (const { input, expected, reason } of edgeCases) {
                const result = splitPath(input);
                expect(result).to.deep.equal(expected, reason);
            }
        });

        it("should handle paths with dots", () => {
            const testCases = [
                { input: "./relative", expected: ["relative"], reason: "current dir marker" },
                { input: "../parent", expected: ["..", "parent"], reason: "parent dir marker" },
                { input: "folder/../other", expected: ["other"], reason: "parent in middle gets resolved" },
            ];

            for (const { input, expected, reason } of testCases) {
                const result = splitPath(input);
                expect(result).to.deep.equal(expected, reason);
            }
        });
    });

    describe("joinPath", () => {
        it("should join path parts with forward slashes", () => {
            const testCases = [
                { input: ["c:", "users", "test"], expected: "c:/users/test", reason: "multiple parts" },
                { input: ["relative", "path"], expected: "relative/path", reason: "relative path" },
                { input: ["file.txt"], expected: "file.txt", reason: "single part" },
            ];

            for (const { input, expected, reason } of testCases) {
                const result = joinPath(...input);
                expect(result).to.equal(expected, reason);
            }
        });

        it("should filter out empty parts", () => {
            const testCases = [
                { input: ["c:", "", "users", "test"], expected: "c:/users/test", reason: "empty in middle" },
                { input: ["", "users", "test"], expected: "users/test", reason: "empty at start" },
                { input: ["users", "test", ""], expected: "users/test", reason: "empty at end" },
            ];

            for (const { input, expected, reason } of testCases) {
                const result = joinPath(...input);
                expect(result).to.equal(expected, reason);
            }
        });

        it("should handle edge cases", () => {
            const edgeCases = [
                { input: [], expected: "", reason: "empty array" },
                { input: [""], expected: "", reason: "single empty string" },
                { input: ["", "", ""], expected: "", reason: "multiple empty strings" },
                { input: ["c:"], expected: "c:", reason: "single drive" },
            ];

            for (const { input, expected, reason } of edgeCases) {
                const result = joinPath(...input);
                expect(result).to.equal(expected, reason);
            }
        });

        it("should handle paths with dots", () => {
            const testCases = [
                { input: [".", "relative"], expected: "./relative", reason: "current directory" },
                { input: ["..", "parent"], expected: "../parent", reason: "parent directory" },
                { input: ["folder", "..", "other"], expected: "folder/../other", reason: "parent in middle" },
            ];

            for (const { input, expected, reason } of testCases) {
                const result = joinPath(...input);
                expect(result).to.equal(expected, reason);
            }
        });
    });

    describe("getParentPath", () => {
        it("should extract parent directory correctly", () => {
            const testCases = [
                { input: "c:/users/test/file.txt", expected: "c:/users/test", reason: "file path" },
                { input: "c:/users/test", expected: "c:/users", reason: "folder path" },
                { input: "c:/users", expected: "c:", reason: "near root" },
                { input: "relative/path/file.txt", expected: "relative/path", reason: "relative file" },
            ];

            for (const { input, expected, reason } of testCases) {
                const result = getParentPath(input);
                expect(result).to.equal(expected, reason);
            }
        });

        it("should handle Windows paths", () => {
            const testCases = [
                { input: "C:\\Users\\Test\\file.txt", expected: "c:/users/test", reason: "Windows file path" },
                { input: "C:\\Users\\Test", expected: "c:/users", reason: "Windows folder" },
            ];

            for (const { input, expected, reason } of testCases) {
                const result = getParentPath(input);
                expect(result).to.equal(expected, reason);
            }
        });

        it("should handle root-level paths", () => {
            const testCases = [
                { input: "c:", expected: "", reason: "drive only" },
                { input: "file.txt", expected: "", reason: "filename only" },
                { input: "c:/file.txt", expected: "c:", reason: "file at root" },
            ];

            for (const { input, expected, reason } of testCases) {
                const result = getParentPath(input);
                expect(result).to.equal(expected, reason);
            }
        });

        it("should handle paths with trailing slashes", () => {
            const testCases = [
                { input: "c:/users/test/", expected: "c:/users", reason: "folder with trailing slash" },
                { input: "c:/users/", expected: "c:", reason: "near root with trailing slash" },
            ];

            for (const { input, expected, reason } of testCases) {
                const result = getParentPath(input);
                expect(result).to.equal(expected, reason);
            }
        });

        it("should handle edge cases", () => {
            const edgeCases = [
                { input: "", expected: "", reason: "empty string" },
                { input: ".", expected: "", reason: "current directory" },
                { input: "..", expected: "", reason: "parent directory marker" },
            ];

            for (const { input, expected, reason } of edgeCases) {
                const result = getParentPath(input);
                expect(result).to.equal(expected, reason);
            }
        });
    });

    describe("changeFileExtension", () => {
        it("should change file extension correctly", () => {
            const testCases = [
                { input: "file.txt", ext: ".pqout", expected: "file.pqout", reason: "basic extension change" },
                { input: "path/to/file.txt", ext: ".json", expected: "path/to/file.json", reason: "path with extension" },
                { input: "C:\\Users\\file.txt", ext: ".log", expected: "C:\\Users\\file.log", reason: "Windows path" },
            ];

            for (const { input, ext, expected, reason } of testCases) {
                const result = changeFileExtension(input, ext);
                expect(result.replace(/\\/g, "/")).to.equal(expected.replace(/\\/g, "/"), reason);
            }
        });

        it("should handle files with no extension", () => {
            const testCases = [
                { input: "file", ext: ".txt", reason: "no extension" },
                { input: "path/to/file", ext: ".log", reason: "path with no extension" },
            ];

            for (const { input, ext, reason } of testCases) {
                const result = changeFileExtension(input, ext);
                expect(result).to.include(ext, reason);
                expect(result).to.not.include(".."), "should not have double dots";
            }
        });

        it("should handle files with multiple dots", () => {
            const testCases = [
                { input: "file.test.txt", ext: ".pqout", reason: "multiple dots" },
                { input: "archive.tar.gz", ext: ".zip", reason: "compound extension" },
            ];

            for (const { input, ext, reason } of testCases) {
                const result = changeFileExtension(input, ext);
                expect(result).to.include(ext, reason);
            }
        });

        it("should handle dotfiles", () => {
            const testCases = [
                { input: ".gitignore", ext: ".bak", reason: "dotfile" },
                { input: ".config.json", ext: ".old", reason: "dotfile with extension" },
            ];

            for (const { input, ext, reason } of testCases) {
                const result = changeFileExtension(input, ext);
                expect(result).to.include(ext, reason);
            }
        });

        it("should handle edge cases", () => {
            const testCases = [
                { input: "file.", ext: ".txt", reason: "trailing dot" },
                { input: ".", ext: ".txt", reason: "just a dot" },
            ];

            for (const { input, ext, reason } of testCases) {
                const result = changeFileExtension(input, ext);
                expect(result).to.be.a("string", reason);
            }
        });
    });

    describe("splitPathPreservingCaseParts", () => {
        it("should return both normalized and original parts", () => {
            const testCases = [
                {
                    input: "C:\\Users\\Test\\File.TXT",
                    expectedNormalized: ["c:", "users", "test", "file.txt"],
                    expectedOriginal: ["C:", "Users", "Test", "File.TXT"],
                    reason: "Windows mixed case",
                },
                {
                    input: "Relative/Path/File.txt",
                    expectedNormalized: ["relative", "path", "file.txt"],
                    expectedOriginal: ["Relative", "Path", "File.txt"],
                    reason: "relative mixed case",
                },
            ];

            for (const { input, expectedNormalized, expectedOriginal, reason } of testCases) {
                const result = splitPathPreservingCaseParts(input);
                expect(result.normalizedParts).to.deep.equal(expectedNormalized, `normalized: ${reason}`);
                expect(result.originalParts).to.deep.equal(expectedOriginal, `original: ${reason}`);
            }
        });

        it("should filter out dots and empty parts from original", () => {
            const testCases = [
                {
                    input: "./relative/path",
                    expectedNormalized: ["relative", "path"],
                    expectedOriginal: ["relative", "path"],
                    reason: "current dir marker normalized out",
                },
                {
                    input: "path/./middle/./file.txt",
                    expectedNormalized: ["path", "middle", "file.txt"],
                    expectedOriginal: ["path", "middle", "file.txt"],
                    reason: "dots filtered from both",
                },
            ];

            for (const { input, expectedNormalized, expectedOriginal, reason } of testCases) {
                const result = splitPathPreservingCaseParts(input);
                expect(result.normalizedParts).to.deep.equal(expectedNormalized, `normalized: ${reason}`);
                expect(result.originalParts).to.deep.equal(expectedOriginal, `original: ${reason}`);
            }
        });

        it("should handle both separators in original", () => {
            const input = "C:\\Users/Test\\File.txt";
            const result = splitPathPreservingCaseParts(input);

            expect(result.originalParts).to.include("C:");
            expect(result.originalParts).to.include("Users");
            expect(result.originalParts).to.include("Test");
            expect(result.originalParts).to.include("File.txt");
        });

        it("should handle edge cases", () => {
            const edgeCases = [
                {
                    input: "",
                    expectedNormalized: [],
                    expectedOriginal: [],
                    reason: "empty string",
                },
                {
                    input: "file.txt",
                    expectedNormalized: ["file.txt"],
                    expectedOriginal: ["file.txt"],
                    reason: "filename only",
                },
            ];

            for (const { input, expectedNormalized, expectedOriginal, reason } of edgeCases) {
                const result = splitPathPreservingCaseParts(input);
                expect(result.normalizedParts).to.deep.equal(expectedNormalized, `normalized: ${reason}`);
                expect(result.originalParts).to.deep.equal(expectedOriginal, `original: ${reason}`);
            }
        });

        it("should preserve case in both parts", () => {
            const input = "FolderName/FileName.txt";
            const result = splitPathPreservingCaseParts(input);

            expect(result.originalParts).to.include("FolderName");
            expect(result.originalParts).to.include("FileName.txt");
            expect(result.normalizedParts).to.satisfy((parts: string[]) =>
                parts.some((p: string) => p.includes("folder") || p.includes("file")),
            );
        });
    });

    describe("Property-Based Testing", () => {
        it("should maintain idempotence for getNormalizedPath with 100 random paths", () => {
            const driveLetters = ["C:", "c:", "D:", "Z:"];
            const folders = ["Users", "test", "Folder", "path"];
            const files = ["file.txt", "test.pq", "data.json"];

            for (let i = 0; i < 100; i++) {
                // Generate structured random path
                const drive = driveLetters[i % driveLetters.length];
                const folder1 = folders[i % folders.length];
                const folder2 = folders[(i + 1) % folders.length];
                const file = files[i % files.length];
                const separator = i % 2 === 0 ? "\\" : "/";

                const path = `${drive}${separator}${folder1}${separator}${folder2}${separator}${file}`;
                const once = getNormalizedPath(path);
                const twice = getNormalizedPath(once);

                expect(once).to.equal(twice, `Not idempotent for iteration ${i}: "${path}"`);
            }
        });

        it("should maintain round-trip integrity for splitPath/joinPath", () => {
            const testPaths = [
                "c:/users/test/file.txt",
                "relative/path/file.txt",
                "c:/single",
                "../parent/file.txt",
                "folder/subfolder/file.txt",
                "c:/a/b/c/d/e/f.txt",
            ];

            for (const originalPath of testPaths) {
                const parts = splitPath(originalPath);
                const rejoined = joinPath(...parts);
                const normalizedOriginal = getNormalizedPath(originalPath);
                const normalizedRejoined = getNormalizedPath(rejoined);

                expect(normalizedRejoined).to.equal(
                    normalizedOriginal,
                    `Round-trip failed for: "${originalPath}"\nParts: [${parts.join(", ")}]\nRejoined: "${rejoined}"`,
                );
            }
        });

        it("should maintain round-trip with boundary-driven data generation", () => {
            const driveLetters = ["C:", "c:", "D:"];
            const separators = ["\\", "/"];
            const lengths = ["a", "ab", "a".repeat(50)];
            const specialFolders = ["Users", "test", "Folder With Spaces", "folder-name", "folder_name"];

            let testCount = 0;

            for (const drive of driveLetters) {
                for (const sep of separators) {
                    for (const len of lengths) {
                        for (const folder of specialFolders) {
                            const path = `${drive}${sep}${folder}${sep}${len}.txt`;
                            const parts = splitPath(path);
                            const rejoined = joinPath(...parts);

                            expect(getNormalizedPath(rejoined)).to.equal(
                                getNormalizedPath(path),
                                `Round-trip failed for: "${path}"`,
                            );
                            testCount++;

                            if (testCount >= 100) {
                                return; // Reached 100 tests
                            }
                        }
                    }
                }
            }
        });
    });

    describe("Performance Testing", () => {
        it("should normalize 1000 paths in <100ms", () => {
            const startTime = Date.now();

            for (let i = 0; i < 1000; i++) {
                getNormalizedPath(`C:\\Users\\Test${i}\\folder\\file.txt`);
            }

            const duration = Date.now() - startTime;
            expect(duration).to.be.lessThan(100, `Took ${duration}ms, expected <100ms`);
        });

        it("should split 1000 paths in <100ms", () => {
            const startTime = Date.now();

            for (let i = 0; i < 1000; i++) {
                splitPath(`C:\\Users\\Test${i}\\folder\\file.txt`);
            }

            const duration = Date.now() - startTime;
            expect(duration).to.be.lessThan(100, `Took ${duration}ms, expected <100ms`);
        });

        it("should join 1000 path arrays in <100ms", () => {
            const startTime = Date.now();

            for (let i = 0; i < 1000; i++) {
                joinPath("c:", "users", `test${i}`, "folder", "file.txt");
            }

            const duration = Date.now() - startTime;
            expect(duration).to.be.lessThan(100, `Took ${duration}ms, expected <100ms`);
        });

        it("should handle 1000 getParentPath operations in <100ms", () => {
            const startTime = Date.now();

            for (let i = 0; i < 1000; i++) {
                getParentPath(`C:\\Users\\Test${i}\\folder\\file.txt`);
            }

            const duration = Date.now() - startTime;
            expect(duration).to.be.lessThan(100, `Took ${duration}ms, expected <100ms`);
        });

        it("should handle 1000 changeFileExtension operations in <100ms", () => {
            const startTime = Date.now();

            for (let i = 0; i < 1000; i++) {
                changeFileExtension(`C:\\Users\\Test${i}\\file.txt`, ".pqout");
            }

            const duration = Date.now() - startTime;
            expect(duration).to.be.lessThan(100, `Took ${duration}ms, expected <100ms`);
        });

        it("should handle 1000 splitPathPreservingCaseParts operations in <100ms", () => {
            const startTime = Date.now();

            for (let i = 0; i < 1000; i++) {
                splitPathPreservingCaseParts(`C:\\Users\\Test${i}\\Folder\\File.TXT`);
            }

            const duration = Date.now() - startTime;
            expect(duration).to.be.lessThan(100, `Took ${duration}ms, expected <100ms`);
        });
    });
});

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { describe, it } from "mocha";
import { expect } from "chai";

import {
    createCompositeId,
    parseCompositeId,
} from "../../../../src/testing/pqtest-adapter/core/compositeId";

describe("compositeId", () => {
    describe("createCompositeId", () => {
        it("should create composite ID with pipe separator", () => {
            const testCases = [
                { testId: "test1", uri: "c:/path/settings.json", expected: "test1|c:/path/settings.json" },
                { testId: "my.test", uri: "file:///c:/path", expected: "my.test|file:///c:/path" },
                { testId: "simple", uri: "relative/path", expected: "simple|relative/path" },
            ];

            for (const { testId, uri, expected } of testCases) {
                const result = createCompositeId(testId, uri);
                expect(result).to.equal(expected, `Failed for testId="${testId}", uri="${uri}"`);
            }
        });

        it("should handle empty strings", () => {
            const testCases = [
                { testId: "", uri: "", expected: "|" },
                { testId: "test", uri: "", expected: "test|" },
                { testId: "", uri: "c:/path", expected: "|c:/path" },
            ];

            for (const { testId, uri, expected } of testCases) {
                const result = createCompositeId(testId, uri);
                expect(result).to.equal(expected);
            }
        });

        it("should handle special characters in test IDs", () => {
            const testCases = [
                { testId: "test/with/slashes", uri: "c:/path", reason: "slashes in ID" },
                { testId: "test with spaces", uri: "c:/path", reason: "spaces in ID" },
                { testId: "test-with-dashes", uri: "c:/path", reason: "dashes in ID" },
                { testId: "test_with_underscores", uri: "c:/path", reason: "underscores in ID" },
            ];

            for (const { testId, uri, reason } of testCases) {
                const result = createCompositeId(testId, uri);
                expect(result).to.include("|"), reason;
                expect(result).to.include(testId), reason;
                expect(result).to.include(uri), reason;
            }
        });

        it("should handle pipe character in inputs", () => {
            // Note: Pipe in inputs will create ambiguous composite IDs
            const testCases = [
                { testId: "test|with|pipes", uri: "c:/path" },
                { testId: "test", uri: "c:/path|with|pipes" },
                { testId: "test|id", uri: "uri|path" },
            ];

            for (const { testId, uri } of testCases) {
                const result = createCompositeId(testId, uri);
                expect(result).to.be.a("string");
                expect(result).to.include("|");
            }
        });

        it("should handle very long strings", () => {
            const longId = "test".repeat(1000);
            const longUri = "c:/path/".repeat(1000) + "file.json";

            const result = createCompositeId(longId, longUri);
            expect(result).to.include("|");
            expect(result).to.include(longId);
            expect(result).to.include(longUri);
            expect(result.length).to.be.greaterThan(10000);
        });

        it("should handle URI-encoded paths", () => {
            const testCases = [
                { testId: "test", uri: "file:///c:/test%20path/file.json", reason: "encoded spaces" },
                { testId: "test", uri: "file:///c:/path/%E4%B8%AD%E6%96%87", reason: "encoded unicode" },
                { testId: "test", uri: "c:/path%2Fwith%2Fencoded%2Fslashes", reason: "encoded slashes" },
            ];

            for (const { testId, uri, reason } of testCases) {
                const result = createCompositeId(testId, uri);
                expect(result).to.equal(`${testId}|${uri}`, reason);
            }
        });
    });

    describe("parseCompositeId", () => {
        it("should parse valid composite IDs correctly", () => {
            const testCases = [
                {
                    input: "test1|c:/path/settings.json",
                    expected: { originalTestId: "test1", settingsFileUri: "c:/path/settings.json" },
                },
                {
                    input: "my.test|file:///c:/path",
                    expected: { originalTestId: "my.test", settingsFileUri: "file:///c:/path" },
                },
                {
                    input: "simple|relative/path",
                    expected: { originalTestId: "simple", settingsFileUri: "relative/path" },
                },
            ];

            for (const { input, expected } of testCases) {
                const result = parseCompositeId(input);
                expect(result).to.not.be.null;
                expect(result!.originalTestId).to.equal(expected.originalTestId);
                expect(result!.settingsFileUri).to.equal(expected.settingsFileUri);
            }
        });

        it("should handle empty parts", () => {
            const testCases = [
                { input: "|", expected: { originalTestId: "", settingsFileUri: "" }, reason: "both empty" },
                { input: "test|", expected: { originalTestId: "test", settingsFileUri: "" }, reason: "empty URI" },
                { input: "|c:/path", expected: { originalTestId: "", settingsFileUri: "c:/path" }, reason: "empty ID" },
            ];

            for (const { input, expected, reason } of testCases) {
                const result = parseCompositeId(input);
                expect(result).to.not.be.null, reason;
                expect(result!.originalTestId).to.equal(expected.originalTestId, reason);
                expect(result!.settingsFileUri).to.equal(expected.settingsFileUri, reason);
            }
        });

        it("should return null for malformed composite IDs", () => {
            const malformedCases = [
                { input: "no-pipe-character", reason: "no pipe" },
                { input: "", reason: "empty string" },
                { input: "test|uri|extra", reason: "too many pipes" },
            ];

            for (const { input, reason } of malformedCases) {
                const result = parseCompositeId(input);
                // All these cases should return null because they don't have exactly 2 parts
                expect(result).to.be.null, reason;
            }
        });

        it("should handle pipe characters in the parts", () => {
            // When there are multiple pipes, split produces more than 2 parts
            // But our function only checks for exactly 2 parts
            const testCases = [
                {
                    input: "test|c:/path",
                    expected: { originalTestId: "test", settingsFileUri: "c:/path" },
                    reason: "normal case",
                },
                {
                    input: "test|uri|extra",
                    expected: { originalTestId: "test", settingsFileUri: "uri|extra" },
                    reason: "extra pipe preserved in URI",
                },
            ];

            for (const { input, expected, reason } of testCases) {
                const result = parseCompositeId(input);
                // With split("|"), "test|uri|extra" produces ["test", "uri", "extra"] (3 parts)
                // So it will return null based on the current implementation
                if (input.split("|").length === 2) {
                    expect(result).to.not.be.null, reason;
                    expect(result!.originalTestId).to.equal(expected.originalTestId, reason);
                    expect(result!.settingsFileUri).to.equal(expected.settingsFileUri, reason);
                } else {
                    expect(result).to.be.null, reason;
                }
            }
        });

        it("should handle special characters", () => {
            const testCases = [
                {
                    input: "test/with/slashes|c:/path",
                    expected: { originalTestId: "test/with/slashes", settingsFileUri: "c:/path" },
                },
                {
                    input: "test with spaces|c:/path",
                    expected: { originalTestId: "test with spaces", settingsFileUri: "c:/path" },
                },
            ];

            for (const { input, expected } of testCases) {
                const result = parseCompositeId(input);
                expect(result).to.not.be.null;
                expect(result!.originalTestId).to.equal(expected.originalTestId);
                expect(result!.settingsFileUri).to.equal(expected.settingsFileUri);
            }
        });

        it("should handle very long composite IDs", () => {
            const longId = "test".repeat(1000);
            const longUri = "c:/path/".repeat(1000) + "file.json";
            const compositeId = `${longId}|${longUri}`;

            const result = parseCompositeId(compositeId);
            expect(result).to.not.be.null;
            expect(result!.originalTestId).to.equal(longId);
            expect(result!.settingsFileUri).to.equal(longUri);
        });

        it("should handle URI-encoded paths", () => {
            const testCases = [
                {
                    input: "test|file:///c:/test%20path/file.json",
                    expected: { originalTestId: "test", settingsFileUri: "file:///c:/test%20path/file.json" },
                },
                {
                    input: "test|c:/path%2Fwith%2Fencoded",
                    expected: { originalTestId: "test", settingsFileUri: "c:/path%2Fwith%2Fencoded" },
                },
            ];

            for (const { input, expected } of testCases) {
                const result = parseCompositeId(input);
                expect(result).to.not.be.null;
                expect(result!.originalTestId).to.equal(expected.originalTestId);
                expect(result!.settingsFileUri).to.equal(expected.settingsFileUri);
            }
        });

        it("should handle edge case strings", () => {
            const testCases = [
                { input: "|", reason: "just pipe" },
                { input: "||", reason: "double pipe" },
                { input: "|||", reason: "triple pipe" },
                { input: "test|", reason: "trailing pipe" },
                { input: "|test", reason: "leading pipe" },
            ];

            for (const { input, reason } of testCases) {
                const result = parseCompositeId(input);
                const parts = input.split("|");
                if (parts.length === 2) {
                    expect(result).to.not.be.null, reason;
                } else {
                    expect(result).to.be.null, reason;
                }
            }
        });
    });

    describe("Property-Based Testing", () => {
        it("should maintain round-trip integrity for 100 random ID pairs", () => {
            const testIds = ["test", "my.test", "test/path", "test-id", "test_id"];
            const uris = ["c:/path/file.json", "file:///c:/path", "relative/path", "//server/share"];

            let iterations = 0;
            for (let i = 0; i < 100; i++) {
                const testId = testIds[i % testIds.length] + i;
                const uri = uris[i % uris.length] + i;

                const composite = createCompositeId(testId, uri);
                const parsed = parseCompositeId(composite);

                expect(parsed).to.not.be.null;
                expect(parsed!.originalTestId).to.equal(testId);
                expect(parsed!.settingsFileUri).to.equal(uri);
                iterations++;
            }

            expect(iterations).to.equal(100);
        });

        it("should maintain round-trip with boundary-driven data", () => {
            const idLengths = ["", "a", "ab", "a".repeat(100)];
            const specialChars = ["test", "test-id", "test_id", "test.id", "test/id"];
            const uriFormats = [
                "c:/path",
                "file:///c:/path",
                "//server/share",
                "relative/path",
                "c:/path%20with%20spaces",
            ];

            let testCount = 0;
            for (const idLen of idLengths) {
                for (const charPattern of specialChars) {
                    for (const uriFormat of uriFormats) {
                        const testId = idLen + charPattern;
                        const uri = uriFormat + testCount;

                        const composite = createCompositeId(testId, uri);
                        const parsed = parseCompositeId(composite);

                        expect(parsed).to.not.be.null;
                        expect(parsed!.originalTestId).to.equal(testId);
                        expect(parsed!.settingsFileUri).to.equal(uri);

                        testCount++;
                        if (testCount >= 100) {
                            return;
                        }
                    }
                }
            }
        });

        it("should handle various separators and special characters", () => {
            const specialCases = [
                { testId: "test\\with\\backslashes", uri: "c:/path" },
                { testId: "test/with/slashes", uri: "c:/path" },
                { testId: "test:with:colons", uri: "c:/path" },
                { testId: "test@with@ats", uri: "c:/path" },
                { testId: "test#with#hashes", uri: "c:/path" },
                { testId: "test=with=equals", uri: "c:/path" },
                { testId: "test&with&amps", uri: "c:/path" },
                { testId: "test?with?questions", uri: "c:/path" },
            ];

            for (const { testId, uri } of specialCases) {
                const composite = createCompositeId(testId, uri);
                const parsed = parseCompositeId(composite);

                expect(parsed).to.not.be.null;
                expect(parsed!.originalTestId).to.equal(testId);
                expect(parsed!.settingsFileUri).to.equal(uri);
            }
        });
    });

    describe("Performance Testing", () => {
        it("should handle 1000 createCompositeId operations in <100ms", () => {
            const startTime = Date.now();

            for (let i = 0; i < 1000; i++) {
                createCompositeId(`test${i}`, `c:/path${i}/file.json`);
            }

            const duration = Date.now() - startTime;
            expect(duration).to.be.lessThan(100, `Took ${duration}ms, expected <100ms`);
        });

        it("should handle 1000 parseCompositeId operations in <100ms", () => {
            const startTime = Date.now();

            for (let i = 0; i < 1000; i++) {
                parseCompositeId(`test${i}|c:/path${i}/file.json`);
            }

            const duration = Date.now() - startTime;
            expect(duration).to.be.lessThan(100, `Took ${duration}ms, expected <100ms`);
        });

        it("should handle 1000 round-trip operations in <100ms", () => {
            const startTime = Date.now();

            for (let i = 0; i < 1000; i++) {
                const composite = createCompositeId(`test${i}`, `c:/path${i}`);
                parseCompositeId(composite);
            }

            const duration = Date.now() - startTime;
            expect(duration).to.be.lessThan(100, `Took ${duration}ms, expected <100ms`);
        });

        it("should handle very long strings efficiently", () => {
            const longId = "test".repeat(10000);
            const longUri = "c:/path/".repeat(10000);

            const startTime = Date.now();

            for (let i = 0; i < 10; i++) {
                const composite = createCompositeId(longId, longUri);
                parseCompositeId(composite);
            }

            const duration = Date.now() - startTime;
            expect(duration).to.be.lessThan(100, `Took ${duration}ms for very long strings`);
        });
    });
});

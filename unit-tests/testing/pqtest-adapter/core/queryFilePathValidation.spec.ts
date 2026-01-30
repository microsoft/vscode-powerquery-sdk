/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { describe, it } from "mocha";
import { expect } from "chai";

import {
    hasValidTestFileEnding,
    QueryFilePathValidationResult,
    validateQueryFilePathField,
} from "../../../../src/testing/pqtest-adapter/core/queryFilePathValidation";

describe("queryFilePathValidation", () => {
    describe("validateQueryFilePathField", () => {
        describe("missing values", () => {
            it("should return error for undefined", () => {
                const result: QueryFilePathValidationResult = validateQueryFilePathField(undefined);

                expect(result.isValid).to.equal(false);
                expect(result.errorCode).to.equal("missing");
                expect(result.error).to.include("missing");
            });

            it("should return error for null", () => {
                const result: QueryFilePathValidationResult = validateQueryFilePathField(null);

                expect(result.isValid).to.equal(false);
                expect(result.errorCode).to.equal("missing");
                expect(result.error).to.include("missing");
            });
        });

        describe("invalid type", () => {
            it("should return error for number", () => {
                const result: QueryFilePathValidationResult = validateQueryFilePathField(123);

                expect(result.isValid).to.equal(false);
                expect(result.errorCode).to.equal("invalid-type");
                expect(result.error).to.include("string");
                expect(result.error).to.include("number");
            });

            it("should return error for boolean", () => {
                const result: QueryFilePathValidationResult = validateQueryFilePathField(true);

                expect(result.isValid).to.equal(false);
                expect(result.errorCode).to.equal("invalid-type");
                expect(result.error).to.include("string");
            });

            it("should return error for object", () => {
                const result: QueryFilePathValidationResult = validateQueryFilePathField({ path: "./test.pq" });

                expect(result.isValid).to.equal(false);
                expect(result.errorCode).to.equal("invalid-type");
                expect(result.error).to.include("string");
            });

            it("should return error for array", () => {
                const result: QueryFilePathValidationResult = validateQueryFilePathField(["./test.pq"]);

                expect(result.isValid).to.equal(false);
                expect(result.errorCode).to.equal("invalid-type");
                expect(result.error).to.include("string");
            });
        });

        describe("empty values", () => {
            it("should return error for empty string", () => {
                const result: QueryFilePathValidationResult = validateQueryFilePathField("");

                expect(result.isValid).to.equal(false);
                expect(result.errorCode).to.equal("empty");
                expect(result.error).to.include("empty");
            });
        });

        describe("whitespace-only values", () => {
            it("should return error for single space", () => {
                const result: QueryFilePathValidationResult = validateQueryFilePathField(" ");

                expect(result.isValid).to.equal(false);
                expect(result.errorCode).to.equal("whitespace-only");
                expect(result.error).to.include("whitespace");
            });

            it("should return error for multiple spaces", () => {
                const result: QueryFilePathValidationResult = validateQueryFilePathField("    ");

                expect(result.isValid).to.equal(false);
                expect(result.errorCode).to.equal("whitespace-only");
                expect(result.error).to.include("whitespace");
            });

            it("should return error for tabs", () => {
                const result: QueryFilePathValidationResult = validateQueryFilePathField("\t\t");

                expect(result.isValid).to.equal(false);
                expect(result.errorCode).to.equal("whitespace-only");
                expect(result.error).to.include("whitespace");
            });

            it("should return error for mixed whitespace", () => {
                const result: QueryFilePathValidationResult = validateQueryFilePathField("  \t  \n  ");

                expect(result.isValid).to.equal(false);
                expect(result.errorCode).to.equal("whitespace-only");
                expect(result.error).to.include("whitespace");
            });
        });

        describe("valid values", () => {
            it("should accept valid relative path", () => {
                const result: QueryFilePathValidationResult = validateQueryFilePathField("./test.query.pq");

                expect(result.isValid).to.equal(true);
                expect(result.errorCode).to.equal(undefined);
                expect(result.error).to.equal(undefined);
            });

            it("should accept valid absolute Windows path", () => {
                const result: QueryFilePathValidationResult = validateQueryFilePathField(
                    "C:\\Users\\test\\queries\\test.query.pq",
                );

                expect(result.isValid).to.equal(true);
                expect(result.errorCode).to.equal(undefined);
            });

            it("should accept valid directory path", () => {
                const result: QueryFilePathValidationResult = validateQueryFilePathField("./tests/queries");

                expect(result.isValid).to.equal(true);
                expect(result.errorCode).to.equal(undefined);
            });

            it("should accept path with leading/trailing spaces (not trimmed)", () => {
                // The validation only checks if it's not purely whitespace
                // Actual path handling is done elsewhere
                const result: QueryFilePathValidationResult = validateQueryFilePathField(" ./test.pq ");

                expect(result.isValid).to.equal(true);
            });
        });
    });

    describe("hasValidTestFileEnding", () => {
        describe("valid endings", () => {
            it("should return true for matching ending", () => {
                expect(hasValidTestFileEnding("test.query.pq", ".query.pq")).to.equal(true);
            });

            it("should return true for path with matching ending", () => {
                expect(hasValidTestFileEnding("C:\\path\\to\\test.query.pq", ".query.pq")).to.equal(true);
            });

            it("should return true for relative path with matching ending", () => {
                expect(hasValidTestFileEnding("./tests/my-test.query.pq", ".query.pq")).to.equal(true);
            });
        });

        describe("invalid endings", () => {
            it("should return false for non-matching ending", () => {
                expect(hasValidTestFileEnding("test.pq", ".query.pq")).to.equal(false);
            });

            it("should return false for partial match", () => {
                expect(hasValidTestFileEnding("testquery.pq", ".query.pq")).to.equal(false);
            });

            it("should return false for different extension", () => {
                expect(hasValidTestFileEnding("test.query.txt", ".query.pq")).to.equal(false);
            });
        });

        describe("edge cases", () => {
            it("should return false for empty filePath", () => {
                expect(hasValidTestFileEnding("", ".query.pq")).to.equal(false);
            });

            it("should return false for empty testFileEnding", () => {
                expect(hasValidTestFileEnding("test.query.pq", "")).to.equal(false);
            });

            it("should return false for both empty", () => {
                expect(hasValidTestFileEnding("", "")).to.equal(false);
            });

            it("should be case-sensitive", () => {
                expect(hasValidTestFileEnding("test.Query.Pq", ".query.pq")).to.equal(false);
            });
        });
    });
});

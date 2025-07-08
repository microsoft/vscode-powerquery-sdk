/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { describe, it } from "mocha";
import { expect } from "chai";

import { ProjectNameValidator, ValidationResult } from "../../src/testing/validation/ValidationUtils";

describe("ProjectNameValidator", () => {
    describe("validate", () => {
        it("should return valid result for valid project names", () => {
            const validNames = [
                "MyProject",
                "TestProject123",
                "Valid_Project_Name",
                "A",
                "ProjectWithNumbers123",
                "Very_Long_Project_Name_With_Underscores",
            ];

            for (const name of validNames) {
                const result: ValidationResult = ProjectNameValidator.validate(name);
                expect(result.isValid).to.equal(true, `"${name}" should be valid`);
                expect(result.error).to.equal(undefined);
            }
        });

        it("should return invalid result for empty or whitespace-only names", () => {
            const invalidNames = ["", " ", "\t", "\n", "  \t\n  "];

            for (const name of invalidNames) {
                const result: ValidationResult = ProjectNameValidator.validate(name);
                expect(result.isValid).to.equal(false, `"${name}" should be invalid`);
                expect(result.error).to.include("Project name is required");
            }
        });

        it("should return invalid result for names starting with non-letter", () => {
            const invalidNames = ["1Project", "_Project", "123abc", "-Project", ".Project", "9ValidName"];

            for (const name of invalidNames) {
                const result: ValidationResult = ProjectNameValidator.validate(name);
                expect(result.isValid).to.equal(false, `"${name}" should be invalid`);
                expect(result.error).to.include("must start with a letter");
            }
        });

        it("should return invalid result for names with invalid characters", () => {
            const invalidNames = [
                "Project-Name",
                "Project Name",
                "Project.Name",
                "Project@Name",
                "Project#Name",
                "Project$Name",
                "Project%Name",
                "Project&Name",
                "Project*Name",
                "Project+Name",
                "Project=Name",
                "Project[Name]",
                "Project{Name}",
                "Project|Name",
                "Project\\Name",
                "Project/Name",
                "Project:Name",
                "Project;Name",
                "Project<Name>",
                "Project,Name",
                "Project?Name",
            ];

            for (const name of invalidNames) {
                const result: ValidationResult = ProjectNameValidator.validate(name);
                expect(result.isValid).to.equal(false, `"${name}" should be invalid`);
                expect(result.error).to.include("contain only letters, numbers, and underscores");
            }
        });

        it("should return invalid result for reserved words", () => {
            const reservedWords = [
                "CON",
                "PRN",
                "AUX",
                "NUL",
                "COM1",
                "COM2",
                "COM3",
                "COM4",
                "COM5",
                "COM6",
                "COM7",
                "COM8",
                "COM9",
                "LPT1",
                "LPT2",
                "LPT3",
                "LPT4",
                "LPT5",
                "LPT6",
                "LPT7",
                "LPT8",
                "LPT9",
            ];

            for (const word of reservedWords) {
                // Test exact case
                let result: ValidationResult = ProjectNameValidator.validate(word);
                expect(result.isValid).to.equal(false, `"${word}" should be invalid (exact case)`);
                expect(result.error).to.include("reserved word");

                // Test lowercase
                result = ProjectNameValidator.validate(word.toLowerCase());
                expect(result.isValid).to.equal(false, `"${word.toLowerCase()}" should be invalid (lowercase)`);
                expect(result.error).to.include("reserved word");

                // Test mixed case
                const mixedCase = word.charAt(0) + word.slice(1).toLowerCase();
                result = ProjectNameValidator.validate(mixedCase);
                expect(result.isValid).to.equal(false, `"${mixedCase}" should be invalid (mixed case)`);
                expect(result.error).to.include("reserved word");
            }
        });

        it("should return invalid result for names exceeding 255 characters", () => {
            const longName = `A${"b".repeat(255)}`; // 256 characters
            const result: ValidationResult = ProjectNameValidator.validate(longName);
            expect(result.isValid).to.equal(false);
            expect(result.error).to.include("cannot exceed 255 characters");
        });

        it("should trim whitespace before validation", () => {
            const namesWithWhitespace = [
                " ValidName ",
                "\tValidName\t",
                "\nValidName\n",
                "  ValidName  ",
                " \t ValidName \t ",
            ];

            for (const name of namesWithWhitespace) {
                const result: ValidationResult = ProjectNameValidator.validate(name);
                expect(result.isValid).to.equal(true, `"${name}" should be valid after trimming`);
            }
        });

        it("should handle maximum valid length (255 characters)", () => {
            const maxLengthName = `A${"b".repeat(254)}`; // Exactly 255 characters
            const result: ValidationResult = ProjectNameValidator.validate(maxLengthName);
            expect(result.isValid).to.equal(true);
            expect(result.error).to.equal(undefined);
        });
    });

    describe("Property-Based Testing - Project Name Validation", () => {
        /**
         * Generate random valid project names
         */
        function generateValidProjectName(): string {
            const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
            const validChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_";

            // Start with a letter
            let name = letters[Math.floor(Math.random() * letters.length)];

            // Add 0-50 additional valid characters
            const additionalLength = Math.floor(Math.random() * 50);

            for (let i = 0; i < additionalLength; i++) {
                name += validChars[Math.floor(Math.random() * validChars.length)];
            }

            return name;
        }

        /**
         * Generate random invalid project names
         */
        function generateInvalidProjectName(): string {
            const invalidPatterns = [
                // Start with number
                (): string => Math.floor(Math.random() * 10) + generateValidProjectName(),
                // Start with underscore
                (): string => `_${generateValidProjectName()}`,
                // Contains space
                (): string => `${generateValidProjectName()} ${generateValidProjectName()}`,
                // Contains special character
                (): string => `${generateValidProjectName()}-${generateValidProjectName()}`,
                // Contains dot
                (): string => `${generateValidProjectName()}.${generateValidProjectName()}`,
            ];

            const pattern = invalidPatterns[Math.floor(Math.random() * invalidPatterns.length)];

            return pattern();
        }

        it("should always accept valid project names", () => {
            // Property: Valid project names should always pass validation
            for (let i = 0; i < 100; i++) {
                const validName = generateValidProjectName();

                // Skip if we accidentally generated a reserved word
                const reservedWords = ["CON", "PRN", "AUX", "NUL"];

                if (reservedWords.some(word => validName.toUpperCase() === word)) {
                    continue;
                }

                const result: ValidationResult = ProjectNameValidator.validate(validName);
                expect(result.isValid).to.equal(true, `Generated valid name should pass: "${validName}"`);
            }
        });

        it("should reject names that don't start with letter", () => {
            // Property: Names not starting with letter should always fail
            for (let i = 0; i < 50; i++) {
                const invalidName = generateInvalidProjectName();

                const result: ValidationResult = ProjectNameValidator.validate(invalidName);

                // Note: Some generated names might be valid if they happen to follow all rules
                // This test focuses on the property that certain patterns should fail
                if (!/^[A-Za-z]/.test(invalidName)) {
                    expect(result.isValid).to.equal(
                        false,
                        `Name not starting with letter should fail: "${invalidName}"`,
                    );
                }
            }
        });

        it("should be case-insensitive for reserved word detection", () => {
            // Property: Reserved words should be rejected regardless of case
            const reservedWords = ["CON", "PRN", "AUX", "NUL"];

            for (const word of reservedWords) {
                const variations = [
                    word.toUpperCase(),
                    word.toLowerCase(),
                    word.charAt(0) + word.slice(1).toLowerCase(),
                    word.charAt(0).toLowerCase() + word.slice(1).toUpperCase(),
                ];

                for (const variation of variations) {
                    const result: ValidationResult = ProjectNameValidator.validate(variation);
                    expect(result.isValid).to.equal(false, `Reserved word should be rejected: "${variation}"`);
                    expect(result.error).to.include("reserved word");
                }
            }
        });

        it("should handle length boundaries correctly", () => {
            // Property: Length validation should be consistent at boundaries
            for (let i = 0; i < 20; i++) {
                // Test exactly at the boundary (255 characters)
                const exactLengthName = `A${"b".repeat(254)}`;
                let result = ProjectNameValidator.validate(exactLengthName);
                expect(result.isValid).to.equal(true, "255-character name should be valid");

                // Test just over the boundary (256 characters)
                const tooLongName = `${exactLengthName}c`;
                result = ProjectNameValidator.validate(tooLongName);
                expect(result.isValid).to.equal(false, "256-character name should be invalid");
                expect(result.error).to.include("cannot exceed 255 characters");
            }
        });

        it("should trim whitespace consistently", () => {
            // Property: Validation should always trim whitespace first
            for (let i = 0; i < 30; i++) {
                const validCore = generateValidProjectName();

                const whitespaceVariations = [
                    ` ${validCore}`,
                    `${validCore} `,
                    ` ${validCore} `,
                    `\t${validCore}`,
                    `${validCore}\n`,
                    `  ${validCore}  `,
                ];

                for (const variation of whitespaceVariations) {
                    const result: ValidationResult = ProjectNameValidator.validate(variation);
                    expect(result.isValid).to.equal(true, `Whitespace should be trimmed: "${variation}"`);
                }
            }
        });
    });

    describe("Edge Case Testing - Project Name Boundaries", () => {
        it("should handle unicode characters correctly", () => {
            const unicodeNames = [
                "Prøject",
                "プロジェクト",
                "Проект",
                "Projet_français",
                "Project_αβγ",
                "مشروع",
                "项目名称",
            ];

            for (const name of unicodeNames) {
                const result: ValidationResult = ProjectNameValidator.validate(name);
                // Unicode characters should be invalid according to the regex
                expect(result.isValid).to.equal(false, `Unicode name should be invalid: "${name}"`);
                expect(result.error).to.include("contain only letters, numbers, and underscores");
            }
        });

        it("should handle extremely long reserved words", () => {
            // Test that reserved word checking works even with padding
            const result = ProjectNameValidator.validate(`${"A".repeat(200)}CON`);
            expect(result.isValid).to.equal(true, "Reserved word embedded in longer name should be valid");
        });

        it("should handle mixed case reserved words with valid format", () => {
            // Test reserved words that follow the valid format pattern
            const reservedWords = ["Con", "Prn", "Aux", "Nul"];

            for (const word of reservedWords) {
                const result: ValidationResult = ProjectNameValidator.validate(word);
                expect(result.isValid).to.equal(false, `Mixed case reserved word should be invalid: "${word}"`);
                expect(result.error).to.include("reserved word");
            }
        });

        it("should handle empty string vs null/undefined", () => {
            // Test different "empty" values
            const emptyValues = ["", null as any, undefined as any];

            for (const value of emptyValues) {
                const result: ValidationResult = ProjectNameValidator.validate(value);
                expect(result.isValid).to.equal(false, `Empty value should be invalid: ${value}`);

                if (result.error) {
                    expect(result.error).to.include("required");
                }
            }
        });

        it("should handle boundary case for COM and LPT ports", () => {
            // Test all COM and LPT ports
            for (let i = 1; i <= 9; i++) {
                let result = ProjectNameValidator.validate(`COM${i}`);
                expect(result.isValid).to.equal(false, `COM${i} should be reserved`);

                result = ProjectNameValidator.validate(`LPT${i}`);
                expect(result.isValid).to.equal(false, `LPT${i} should be reserved`);

                result = ProjectNameValidator.validate(`com${i}`);
                expect(result.isValid).to.equal(false, `com${i} should be reserved (case insensitive)`);

                result = ProjectNameValidator.validate(`lpt${i}`);
                expect(result.isValid).to.equal(false, `lpt${i} should be reserved (case insensitive)`);
            }
        });
    });
});

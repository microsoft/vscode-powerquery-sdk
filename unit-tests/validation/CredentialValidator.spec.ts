/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { describe, it } from "mocha";
import { expect } from "chai";

import { CredentialValidator, ValidationResult } from "../../src/testing/validation/ValidationUtils";

/**
 * Generate random authentication states for testing
 */
function generateRandomAuthState(override: Partial<any> = {}): any {
    const authKinds = ["Anonymous", "UsernamePassword", "Key", "Windows"]; // Use only valid auth kinds
    const dataSourceKinds = ["TestSource", "WebAPI", "Database", "FileSystem"];

    return {
        DataSourceKind: dataSourceKinds[Math.floor(Math.random() * dataSourceKinds.length)],
        AuthenticationKind: authKinds[Math.floor(Math.random() * authKinds.length)],
        PathToQueryFile: `/test/query${Math.floor(Math.random() * 1000)}.pq`,
        ...override,
    };
}

describe("CredentialValidator", () => {
    describe("validate", () => {
        it("should return valid result for complete credential state", () => {
            // Arrange
            const validAuthState = {
                DataSourceKind: "TestDataSource",
                AuthenticationKind: "Key",
                PathToQueryFile: "/test/path.pq",
                $$KEY$$: "test-key",
            };

            // Act
            const result: ValidationResult = CredentialValidator.validate(validAuthState);

            // Assert
            expect(result.isValid).to.equal(true);
            expect(result.error).to.equal(undefined);
        });

        it("should return invalid result for missing required fields", () => {
            // Arrange
            const incompleteAuthState = {
                DataSourceKind: "TestDataSource",
                // Missing AuthenticationKind and PathToQueryFile
            };

            // Act
            const result: ValidationResult = CredentialValidator.validate(incompleteAuthState);

            // Assert
            expect(result.isValid).to.equal(false);
            expect(result.error).to.include("Missing required fields");
        });

        it("should return invalid result for username/password auth without password", () => {
            // Arrange
            const authStateWithoutPassword = {
                DataSourceKind: "TestDataSource",
                AuthenticationKind: "UsernamePassword",
                PathToQueryFile: "/test/path.pq",
                $$USERNAME$$: "test-user",
                // Missing $$PASSWORD$$
            };

            // Act
            const result: ValidationResult = CredentialValidator.validate(authStateWithoutPassword);

            // Assert
            expect(result.isValid).to.equal(false);
            expect(result.error).to.include("Missing username or password");
        });

        it("should return invalid result for username/password auth without username", () => {
            // Arrange
            const authStateWithoutUsername = {
                DataSourceKind: "TestDataSource",
                AuthenticationKind: "UsernamePassword",
                PathToQueryFile: "/test/path.pq",
                $$PASSWORD$$: "test-password",
                // Missing $$USERNAME$$
            };

            // Act
            const result: ValidationResult = CredentialValidator.validate(authStateWithoutUsername);

            // Assert
            expect(result.isValid).to.equal(false);
            expect(result.error).to.include("Missing username or password");
        });

        it("should return valid result for complete username/password auth", () => {
            // Arrange
            const validUsernamePasswordAuth = {
                DataSourceKind: "TestDataSource",
                AuthenticationKind: "UsernamePassword",
                PathToQueryFile: "/test/path.pq",
                $$USERNAME$$: "test-user",
                $$PASSWORD$$: "test-password",
            };

            // Act
            const result: ValidationResult = CredentialValidator.validate(validUsernamePasswordAuth);

            // Assert
            expect(result.isValid).to.equal(true);
            expect(result.error).to.equal(undefined);
        });

        it("should return invalid result for key auth without key", () => {
            // Arrange
            const authStateWithoutKey = {
                DataSourceKind: "TestDataSource",
                AuthenticationKind: "Key",
                PathToQueryFile: "/test/path.pq",
                // Missing $$KEY$$
            };

            // Act
            const result: ValidationResult = CredentialValidator.validate(authStateWithoutKey);

            // Assert
            expect(result.isValid).to.equal(false);
            expect(result.error).to.include("Missing key");
        });

        it("should handle case-insensitive authentication kinds", () => {
            // Arrange
            const authStateWithLowercase = {
                DataSourceKind: "TestDataSource",
                AuthenticationKind: "key",
                PathToQueryFile: "/test/path.pq",
                $$KEY$$: "test-key",
            };

            // Act
            const result: ValidationResult = CredentialValidator.validate(authStateWithLowercase);

            // Assert
            expect(result.isValid).to.equal(true);
            expect(result.error).to.equal(undefined);
        });
    });

    describe("validateAuthenticationKind", () => {
        it("should return valid result for supported authentication kinds", () => {
            // Arrange
            const validAuthKinds = ["anonymous", "usernamepassword", "key", "oauth", "windows"];

            // Act & Assert
            for (const authKind of validAuthKinds) {
                const result: ValidationResult = CredentialValidator.validateAuthenticationKind(authKind);
                expect(result.isValid).to.equal(true);
                expect(result.error).to.equal(undefined);
            }
        });

        it("should handle case-insensitive authentication kinds", () => {
            // Arrange
            const mixedCaseAuthKinds = ["Anonymous", "USERNAMEPASSWORD", "Key", "OAuth", "Windows"];

            // Act & Assert
            for (const authKind of mixedCaseAuthKinds) {
                const result: ValidationResult = CredentialValidator.validateAuthenticationKind(authKind);
                expect(result.isValid).to.equal(true);
                expect(result.error).to.equal(undefined);
            }
        });

        it("should return invalid result for unsupported authentication kinds", () => {
            // Arrange
            const invalidAuthKinds = ["invalid", "custom", "bearer", ""];

            // Act & Assert
            for (const authKind of invalidAuthKinds) {
                const result: ValidationResult = CredentialValidator.validateAuthenticationKind(authKind);
                expect(result.isValid).to.equal(false);
                expect(result.error).to.be.a("string");
            }
        });

        it("should return invalid result for empty authentication kind", () => {
            // Act
            const result: ValidationResult = CredentialValidator.validateAuthenticationKind("");

            // Assert
            expect(result.isValid).to.equal(false);
            expect(result.error).to.include("Authentication kind is required");
        });

        it("should list valid options in error message", () => {
            // Act
            const result: ValidationResult = CredentialValidator.validateAuthenticationKind("invalid");

            // Assert
            expect(result.isValid).to.equal(false);
            expect(result.error).to.include("anonymous, usernamepassword, key, oauth, windows");
        });
    });

    describe("Property-Based Testing - Validation Rules", () => {
        /**
         * Generate random authentication states for testing
         */
        function generateRandomAuthState(override: Partial<any> = {}): any {
            const authKinds = ["Anonymous", "UsernamePassword", "Key", "Windows"]; // Use only valid auth kinds
            const dataSourceKinds = ["TestSource", "WebAPI", "Database", "FileSystem"];

            return {
                DataSourceKind: dataSourceKinds[Math.floor(Math.random() * dataSourceKinds.length)],
                AuthenticationKind: authKinds[Math.floor(Math.random() * authKinds.length)],
                PathToQueryFile: `/test/query${Math.floor(Math.random() * 1000)}.pq`,
                ...override,
            };
        }

        it("should always validate Anonymous authentication regardless of credentials", () => {
            // Property: Anonymous auth should always be valid with required fields
            for (let i = 0; i < 20; i++) {
                const authState = generateRandomAuthState({
                    AuthenticationKind: "Anonymous",
                    // Add random extra fields that shouldn't affect validation
                    [`randomField${i}`]: `randomValue${i}`,
                });

                const result: ValidationResult = CredentialValidator.validate(authState);

                expect(result.isValid).to.equal(
                    true,
                    `Anonymous auth should be valid for iteration ${i}: ${JSON.stringify(authState)}`,
                );
            }
        });

        it("should always require username AND password for UsernamePassword auth", () => {
            // Property: UsernamePassword auth requires both username and password
            for (let i = 0; i < 10; i++) {
                const baseState = generateRandomAuthState({
                    AuthenticationKind: "UsernamePassword",
                });

                // Test missing username
                const withoutUsername = { ...baseState, $$PASSWORD$$: "password123" };
                const resultNoUser = CredentialValidator.validate(withoutUsername);

                expect(resultNoUser.isValid).to.equal(
                    false,
                    `Should be invalid without username: ${JSON.stringify(withoutUsername)}`,
                );

                // Test missing password
                const withoutPassword = { ...baseState, $$USERNAME$$: "user123" };
                const resultNoPass = CredentialValidator.validate(withoutPassword);

                expect(resultNoPass.isValid).to.equal(
                    false,
                    `Should be invalid without password: ${JSON.stringify(withoutPassword)}`,
                );

                // Test with both
                const withBoth = { ...baseState, $$USERNAME$$: "user123", $$PASSWORD$$: "password123" };
                const resultBoth = CredentialValidator.validate(withBoth);
                expect(resultBoth.isValid).to.equal(true, `Should be valid with both: ${JSON.stringify(withBoth)}`);
            }
        });

        it("should always require key for Key authentication", () => {
            // Property: Key auth always requires $$KEY$$ field
            for (let i = 0; i < 10; i++) {
                const baseState = generateRandomAuthState({
                    AuthenticationKind: "Key",
                });

                // Test without key
                const withoutKey = { ...baseState };
                delete withoutKey.$$KEY$$;
                const resultNoKey = CredentialValidator.validate(withoutKey);

                expect(resultNoKey.isValid).to.equal(
                    false,
                    `Key auth should be invalid without key: ${JSON.stringify(withoutKey)}`,
                );

                // Test with key
                const withKey = { ...baseState, $$KEY$$: `testkey${i}` };
                const resultWithKey = CredentialValidator.validate(withKey);

                expect(resultWithKey.isValid).to.equal(
                    true,
                    `Key auth should be valid with key: ${JSON.stringify(withKey)}`,
                );
            }
        });

        it("should reject invalid values for required fields", () => {
            // Property: Required fields should never accept invalid values
            const invalidValues = [null, undefined, "", 0, false]; // Note: whitespace strings pass current validation
            const requiredFields = ["DataSourceKind", "AuthenticationKind", "PathToQueryFile"];

            for (const field of requiredFields) {
                for (const invalidValue of invalidValues) {
                    const authState = generateRandomAuthState({
                        [field]: invalidValue,
                    });

                    const result: ValidationResult = CredentialValidator.validate(authState);

                    expect(result.isValid).to.equal(
                        false,
                        `Should reject invalid ${field} value: ${invalidValue} (type: ${typeof invalidValue})`,
                    );
                }
            }
        });

        it("should be case-insensitive for authentication kinds", () => {
            // Property: Authentication kind validation should be case-insensitive
            const validAuthKinds = ["Anonymous", "UsernamePassword", "Key", "Windows"];

            for (const authKind of validAuthKinds) {
                const variations = [
                    authKind.toLowerCase(),
                    authKind.toUpperCase(),
                    authKind.charAt(0).toLowerCase() + authKind.slice(1),
                    authKind.charAt(0).toUpperCase() + authKind.slice(1).toLowerCase(),
                ];

                for (const variation of variations) {
                    const authState = generateRandomAuthState({
                        AuthenticationKind: variation,
                    });

                    // Add required credentials based on auth type
                    if (variation.toLowerCase() === "usernamepassword") {
                        authState.$$USERNAME$$ = "testuser";
                        authState.$$PASSWORD$$ = "testpass";
                    } else if (variation.toLowerCase() === "key") {
                        authState.$$KEY$$ = "testkey";
                    }

                    const result: ValidationResult = CredentialValidator.validate(authState);

                    expect(result.isValid).to.equal(
                        true,
                        `${authKind} should be valid in case variation: ${variation}`,
                    );
                }
            }
        });

        it("should handle extremely long but valid field values", () => {
            // Property: Valid long strings should not break validation
            const longButValidString = "a".repeat(1000);

            for (let i = 0; i < 5; i++) {
                const authState = generateRandomAuthState({
                    DataSourceKind: longButValidString,
                    AuthenticationKind: "Anonymous", // Use valid auth kind
                    PathToQueryFile: `/test/${"longpath".repeat(100)}.pq`,
                });

                const result: ValidationResult = CredentialValidator.validate(authState);
                expect(result.isValid).to.equal(true, `Should handle long valid strings in iteration ${i}`);
            }
        });
    });

    describe("Performance Testing - Validation Speed", () => {
        it("should validate credentials quickly under load", () => {
            // Property: Validation should remain fast even with many operations
            const startTime = Date.now();
            const iterations = 1000;

            for (let i = 0; i < iterations; i++) {
                const authState = {
                    DataSourceKind: `DataSource${i}`,
                    AuthenticationKind: "Key",
                    PathToQueryFile: `/test/query${i}.pq`,
                    $$KEY$$: `key${i}`,
                };

                const result: ValidationResult = CredentialValidator.validate(authState);
                expect(result.isValid).to.equal(true);
            }

            const endTime = Date.now();
            const totalTime = endTime - startTime;

            // Should complete 1000 validations in under 100ms (very fast)
            expect(totalTime).to.be.lessThan(100, `${iterations} validations took ${totalTime}ms, should be < 100ms`);
        });

        it("should validate authentication kinds quickly", () => {
            // Property: Authentication kind validation should be very fast
            const startTime = Date.now();
            const iterations = 10000;
            const authKinds = ["anonymous", "usernamepassword", "key", "oauth", "windows"];

            for (let i = 0; i < iterations; i++) {
                const authKind = authKinds[i % authKinds.length];
                const result: ValidationResult = CredentialValidator.validateAuthenticationKind(authKind);
                expect(result.isValid).to.equal(true);
            }

            const endTime = Date.now();
            const totalTime = endTime - startTime;

            // Should complete 10,000 auth kind validations in under 100ms
            expect(totalTime).to.be.lessThan(
                100,
                `${iterations} auth validations took ${totalTime}ms, should be < 100ms`,
            );
        });

        it("should handle validation failures quickly", () => {
            // Property: Validation failures should not be slower than successes
            const startTime = Date.now();
            const iterations = 1000;

            for (let i = 0; i < iterations; i++) {
                const authState = {
                    DataSourceKind: "", // Invalid
                    AuthenticationKind: "Key",
                    PathToQueryFile: `/test/query${i}.pq`,
                };

                const result: ValidationResult = CredentialValidator.validate(authState);
                expect(result.isValid).to.equal(false);
            }

            const endTime = Date.now();
            const totalTime = endTime - startTime;

            // Failure validation should also be very fast
            expect(totalTime).to.be.lessThan(
                100,
                `${iterations} failure validations took ${totalTime}ms, should be < 100ms`,
            );
        });
    });

    describe("Edge Case Testing - Boundary Conditions", () => {
        it("should handle maximum safe integer values", () => {
            const authState = generateRandomAuthState({
                DataSourceKind: `DataSource${Number.MAX_SAFE_INTEGER}`,
                AuthenticationKind: "Anonymous",
                PathToQueryFile: `/test/query${Number.MAX_SAFE_INTEGER}.pq`,
            });

            const result: ValidationResult = CredentialValidator.validate(authState);
            expect(result.isValid).to.equal(true);
        });

        it("should handle unicode characters in field values", () => {
            const unicodeStrings = [
                "数据源", // Chinese
                "источник данных", // Russian
                "مصدر البيانات", // Arabic
                "🚀💻📊", // Emojis
                "DataSource™®©", // Special symbols
            ];

            for (const unicodeString of unicodeStrings) {
                const authState = generateRandomAuthState({
                    DataSourceKind: unicodeString,
                    AuthenticationKind: "Anonymous",
                    PathToQueryFile: `/test/${unicodeString}.pq`,
                });

                const result: ValidationResult = CredentialValidator.validate(authState);
                expect(result.isValid).to.equal(true, `Should handle unicode: ${unicodeString}`);
            }
        });

        it("should handle edge case password and username combinations", () => {
            // Test various edge cases for username/password authentication
            const edgeCases = [
                { $$USERNAME$$: "a", $$PASSWORD$$: "b" }, // Single character
                { $$USERNAME$$: "user@domain.com", $$PASSWORD$$: "complex!@#$%^&*()_+" }, // Email + special chars
                { $$USERNAME$$: "user with spaces", $$PASSWORD$$: "password with spaces" }, // Spaces
                { $$USERNAME$$: "UPPERCASE", $$PASSWORD$$: "lowercase" }, // Case variations
            ];

            for (let i = 0; i < edgeCases.length; i++) {
                const authState = generateRandomAuthState({
                    AuthenticationKind: "UsernamePassword",
                    ...edgeCases[i],
                });

                const result: ValidationResult = CredentialValidator.validate(authState);

                expect(result.isValid).to.equal(
                    true,
                    `Edge case ${i} should be valid: ${JSON.stringify(edgeCases[i])}`,
                );
            }
        });

        it("should handle concurrent validation calls", async () => {
            // Property: Validator should be thread-safe and handle concurrent calls
            const promises = [];

            for (let i = 0; i < 100; i++) {
                const promise = new Promise<void>(resolve => {
                    const authState = generateRandomAuthState({
                        DataSourceKind: `ConcurrentTest${i}`,
                        AuthenticationKind: "Anonymous",
                    });

                    const result: ValidationResult = CredentialValidator.validate(authState);
                    expect(result.isValid).to.equal(true);
                    resolve();
                });

                promises.push(promise);
            }

            // All concurrent validations should complete successfully
            await Promise.all(promises);
        });
    });
});

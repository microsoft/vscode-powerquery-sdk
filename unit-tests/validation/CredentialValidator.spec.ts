/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { describe, it } from "mocha";
import { expect } from "chai";

import { CredentialValidator, ValidationResult } from "../../src/testing/validation/ValidationUtils";

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
});

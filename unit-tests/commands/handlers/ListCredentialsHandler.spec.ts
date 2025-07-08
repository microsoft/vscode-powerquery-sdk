/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { SinonStub, stub } from "sinon";
import { expect } from "chai";

import { ListCredentialsHandler, ListCredentialsResult } from "../../../src/commands/handlers/ListCredentialsHandler";
import { CommandResult } from "../../../src/commands/handlers/ICommandHandler";
import { IPQTestService } from "../../../src/common/PQTestService";

describe("ListCredentialsHandler", () => {
    let mockPqTestService: Partial<IPQTestService>;
    let listCredentialsStub: SinonStub;
    let handler: ListCredentialsHandler;

    beforeEach(() => {
        listCredentialsStub = stub();

        mockPqTestService = {
            ListCredentials: listCredentialsStub,
        };

        handler = new ListCredentialsHandler(mockPqTestService as IPQTestService);
    });

    describe("execute", () => {
        it("should return success result with credentials when service succeeds", async () => {
            // Arrange
            const mockCredentials = [
                { name: "credential1", type: "Basic" },
                { name: "credential2", type: "OAuth2" },
            ];

            listCredentialsStub.resolves(mockCredentials);

            // Act
            const result: CommandResult<ListCredentialsResult> = await handler.execute({});

            // Assert
            expect(result.success).to.equal(true);
            expect(result.data).to.not.equal(undefined);
            expect(result.data!.credentials).to.deep.equal(mockCredentials);
            expect(result.data!.formattedOutput).to.contain("credential1");
            expect(result.data!.formattedOutput).to.contain("credential2");
            expect(result.error).to.equal(undefined);
        });

        it("should return formatted JSON output", async () => {
            // Arrange
            const mockCredentials = [{ name: "test", type: "Basic" }];

            listCredentialsStub.resolves(mockCredentials);

            // Act
            const result: CommandResult<ListCredentialsResult> = await handler.execute({});

            // Assert
            expect(result.success).to.equal(true);
            expect(result.data!.formattedOutput).to.equal(JSON.stringify(mockCredentials, null, 2));
        });

        it("should handle empty credentials list", async () => {
            // Arrange
            const mockCredentials: unknown[] = [];

            listCredentialsStub.resolves(mockCredentials);

            // Act
            const result: CommandResult<ListCredentialsResult> = await handler.execute({});

            // Assert
            expect(result.success).to.equal(true);
            expect(result.data!.credentials).to.deep.equal([]);
            expect(result.data!.formattedOutput).to.equal("[]");
        });

        it("should return error result when service throws Error", async () => {
            // Arrange
            const errorMessage = "Failed to list credentials";

            listCredentialsStub.rejects(new Error(errorMessage));

            // Act
            const result: CommandResult<ListCredentialsResult> = await handler.execute({});

            // Assert
            expect(result.success).to.equal(false);
            expect(result.data).to.equal(undefined);
            expect(result.error).to.equal(errorMessage);
        });

        it("should return error result when service throws string", async () => {
            // Arrange
            const errorMessage = "String error message";

            listCredentialsStub.throws(errorMessage);

            // Act
            const result: CommandResult<ListCredentialsResult> = await handler.execute({});

            // Assert
            expect(result.success).to.equal(false);
            expect(result.data).to.equal(undefined);
            expect(result.error).to.equal("Sinon-provided String error message"); // Sinon prefixes string errors
        });

        it("should handle non-Error non-string exceptions", async () => {
            // Arrange
            const errorObject = { code: 500, message: "Server error" };

            listCredentialsStub.rejects(errorObject);

            // Act
            const result: CommandResult<ListCredentialsResult> = await handler.execute({});

            // Assert
            expect(result.success).to.equal(false);
            expect(result.data).to.equal(undefined);
            expect(result.error).to.equal("[object Object]");
        });

        it("should call ListCredentials exactly once", async () => {
            // Arrange
            listCredentialsStub.resolves([]);

            // Act
            await handler.execute({});

            // Assert
            expect(listCredentialsStub.calledOnce).to.equal(true);
        });

        // Edge Cases and Advanced Scenarios
        it("should handle credentials with null values", async () => {
            // Arrange
            const mockCredentials = [
                { name: null, type: "Basic" },
                { name: "ValidCredential", type: null },
                null,
                undefined,
            ];

            listCredentialsStub.resolves(mockCredentials);

            // Act
            const result: CommandResult<ListCredentialsResult> = await handler.execute({});

            // Assert
            expect(result.success).to.equal(true);
            expect(result.data!.credentials).to.deep.equal(mockCredentials);
            expect(result.data!.formattedOutput).to.contain("null");
        });

        it("should handle very large credential lists", async () => {
            // Arrange
            const largeCredentialList = Array.from({ length: 1000 }, (_, i) => ({
                name: `credential_${i}`,
                type: "Basic",
                created: new Date().toISOString(),
            }));

            listCredentialsStub.resolves(largeCredentialList);

            // Act
            const startTime = Date.now();
            const result: CommandResult<ListCredentialsResult> = await handler.execute({});
            const duration = Date.now() - startTime;

            // Assert
            expect(result.success).to.equal(true);
            expect(result.data!.credentials).to.have.length(1000);
            expect(duration).to.be.lessThan(100); // Should format large lists quickly
        });

        it("should handle credentials with special characters", async () => {
            // Arrange
            const mockCredentials = [
                { name: "credential-with-unicode-🔐", type: "OAuth2" },
                { name: "credential\nwith\nnewlines", type: "Basic" },
                { name: 'credential"with"quotes', type: "Key" },
                { name: "credential\\with\\backslashes", type: "Basic" },
            ];

            listCredentialsStub.resolves(mockCredentials);

            // Act
            const result: CommandResult<ListCredentialsResult> = await handler.execute({});

            // Assert
            expect(result.success).to.equal(true);
            expect(result.data!.formattedOutput).to.contain("🔐");
            expect(result.data!.formattedOutput).to.contain("\\n");
            expect(result.data!.formattedOutput).to.contain('\\"');
        });

        it("should handle circular reference objects gracefully", async () => {
            // Arrange
            const circularCredential: any = { name: "circular", type: "Basic" };
            circularCredential.self = circularCredential;

            listCredentialsStub.resolves([circularCredential]);

            // Act & Assert - Should not throw but handle gracefully
            const result: CommandResult<ListCredentialsResult> = await handler.execute({});

            // JSON.stringify throws on circular references, so should be handled as error
            expect(result.success).to.equal(false);
            expect(result.error).to.contain("circular");
        });

        it("should handle timeout errors from service", async () => {
            // Arrange
            const timeoutError = new Error("Request timeout");
            timeoutError.name = "TimeoutError";

            listCredentialsStub.rejects(timeoutError);

            // Act
            const result: CommandResult<ListCredentialsResult> = await handler.execute({});

            // Assert
            expect(result.success).to.equal(false);
            expect(result.error).to.equal("Request timeout");
        });

        it("should handle network errors from service", async () => {
            // Arrange
            const networkError = new Error("ECONNREFUSED: Connection refused");
            networkError.name = "NetworkError";

            listCredentialsStub.rejects(networkError);

            // Act
            const result: CommandResult<ListCredentialsResult> = await handler.execute({});

            // Assert
            expect(result.success).to.equal(false);
            expect(result.error).to.equal("ECONNREFUSED: Connection refused");
        });
    });

    describe("Edge Cases and Performance", () => {
        it("should handle extremely deep nested credential objects", async () => {
            // Arrange
            let deepObject: any = { name: "deep-credential", type: "Basic" };

            for (let i = 0; i < 100; i++) {
                deepObject = { level: i, nested: deepObject };
            }

            listCredentialsStub.resolves([deepObject]);

            // Act
            const result: CommandResult<ListCredentialsResult> = await handler.execute({});

            // Assert
            expect(result.success).to.equal(true);
            expect(result.data!.formattedOutput).to.contain("deep-credential");
        });

        it("should handle credentials with very long strings", async () => {
            // Arrange
            const longString = "x".repeat(10000);
            const mockCredentials = [{ name: longString, type: "Basic" }];

            listCredentialsStub.resolves(mockCredentials);

            // Act
            const result: CommandResult<ListCredentialsResult> = await handler.execute({});

            // Assert
            expect(result.success).to.equal(true);
            expect(result.data!.formattedOutput).to.have.length.greaterThan(10000);
        });
    });
});

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { SinonStub, stub } from "sinon";
import { expect } from "chai";

import { GenericResult, IPQTestService } from "../../../src/common/PQTestService";
import {
    RefreshCredentialHandler,
    RefreshCredentialResult,
} from "../../../src/commands/handlers/RefreshCredentialHandler";
import { CommandResult } from "../../../src/commands/handlers/ICommandHandler";

describe("RefreshCredentialHandler", () => {
    let mockPqTestService: Partial<IPQTestService>;
    let refreshCredentialStub: SinonStub;
    let handler: RefreshCredentialHandler;

    beforeEach(() => {
        refreshCredentialStub = stub();

        mockPqTestService = {
            RefreshCredential: refreshCredentialStub,
        };

        handler = new RefreshCredentialHandler(mockPqTestService as IPQTestService);
    });

    describe("execute", () => {
        it("should return success result when service succeeds", async () => {
            // Arrange
            const mockResult: GenericResult = {
                Status: "Success",
                Message: "Credential refreshed successfully",
                Details: { refreshed: true },
            };

            refreshCredentialStub.resolves(mockResult);

            // Act
            const result: CommandResult<RefreshCredentialResult> = await handler.execute({});

            // Assert
            expect(result.success).to.equal(true);
            expect(result.data).to.not.equal(undefined);
            expect(result.data!.result).to.deep.equal(mockResult);
            expect(result.data!.formattedOutput).to.contain("Success");
            expect(result.error).to.equal(undefined);
        });

        it("should return formatted JSON output", async () => {
            // Arrange
            const mockResult: GenericResult = {
                Status: "Success",
                Message: "Refreshed",
                Details: null,
            };

            refreshCredentialStub.resolves(mockResult);

            // Act
            const result: CommandResult<RefreshCredentialResult> = await handler.execute({});

            // Assert
            expect(result.success).to.equal(true);
            expect(result.data!.formattedOutput).to.equal(JSON.stringify(mockResult, null, 2));
        });

        it("should handle credential refresh failure gracefully", async () => {
            // Arrange
            const mockResult: GenericResult = {
                Status: "Failure",
                Message: "Refresh failed",
                Details: { error: "Token expired" },
            };

            refreshCredentialStub.resolves(mockResult);

            // Act
            const result: CommandResult<RefreshCredentialResult> = await handler.execute({});

            // Assert
            expect(result.success).to.equal(true); // Handler succeeded, but refresh failed
            expect(result.data!.result.Status).to.equal("Failure");
            expect(result.data!.formattedOutput).to.contain("Failure");
        });

        it("should return error result when service throws Error", async () => {
            // Arrange
            const errorMessage = "Failed to refresh credential";

            refreshCredentialStub.rejects(new Error(errorMessage));

            // Act
            const result: CommandResult<RefreshCredentialResult> = await handler.execute({});

            // Assert
            expect(result.success).to.equal(false);
            expect(result.data).to.equal(undefined);
            expect(result.error).to.equal(errorMessage);
        });

        it("should return error result when service throws string", async () => {
            // Arrange
            const errorMessage = "String error message";

            refreshCredentialStub.throws(errorMessage);

            // Act
            const result: CommandResult<RefreshCredentialResult> = await handler.execute({});

            // Assert
            expect(result.success).to.equal(false);
            expect(result.data).to.equal(undefined);
            expect(result.error).to.equal("Sinon-provided String error message");
        });

        it("should handle non-Error non-string exceptions", async () => {
            // Arrange
            const errorObject = { code: 401, message: "Unauthorized" };

            refreshCredentialStub.rejects(errorObject);

            // Act
            const result: CommandResult<RefreshCredentialResult> = await handler.execute({});

            // Assert
            expect(result.success).to.equal(false);
            expect(result.data).to.equal(undefined);
            expect(result.error).to.equal("[object Object]");
        });

        it("should call RefreshCredential exactly once", async () => {
            // Arrange
            refreshCredentialStub.resolves({
                Status: "Success",
                Message: "Refreshed",
                Details: null,
            });

            // Act
            await handler.execute({});

            // Assert
            expect(refreshCredentialStub.calledOnce).to.equal(true);
        });
    });
});

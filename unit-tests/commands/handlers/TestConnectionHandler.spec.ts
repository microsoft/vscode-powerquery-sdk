/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { SinonStub, stub } from "sinon";
import { expect } from "chai";

import { GenericResult, IPQTestService } from "../../../src/common/PQTestService";
import { TestConnectionHandler, TestConnectionResult } from "../../../src/commands/handlers/TestConnectionHandler";
import { CommandResult } from "../../../src/commands/handlers/ICommandHandler";

describe("TestConnectionHandler", () => {
    let mockPqTestService: Partial<IPQTestService>;
    let testConnectionStub: SinonStub;
    let handler: TestConnectionHandler;

    beforeEach(() => {
        testConnectionStub = stub();

        mockPqTestService = {
            TestConnection: testConnectionStub,
        };

        handler = new TestConnectionHandler(mockPqTestService as IPQTestService);
    });

    describe("execute", () => {
        it("should return success result when connection test succeeds", async () => {
            // Arrange
            const mockResult: GenericResult = {
                Status: "Success",
                Message: "Connection successful",
                Details: { connected: true },
            };

            testConnectionStub.resolves(mockResult);

            // Act
            const result: CommandResult<TestConnectionResult> = await handler.execute({});

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
                Message: "Test completed",
                Details: null,
            };

            testConnectionStub.resolves(mockResult);

            // Act
            const result: CommandResult<TestConnectionResult> = await handler.execute({});

            // Assert
            expect(result.success).to.equal(true);
            expect(result.data!.formattedOutput).to.equal(JSON.stringify(mockResult, null, 2));
        });

        it("should handle connection failure gracefully", async () => {
            // Arrange
            const mockResult: GenericResult = {
                Status: "Failure",
                Message: "Connection failed",
                Details: { error: "Timeout" },
            };

            testConnectionStub.resolves(mockResult);

            // Act
            const result: CommandResult<TestConnectionResult> = await handler.execute({});

            // Assert
            expect(result.success).to.equal(true); // Handler succeeded, but connection failed
            expect(result.data!.result.Status).to.equal("Failure");
            expect(result.data!.formattedOutput).to.contain("Failure");
        });

        it("should return error result when service throws Error", async () => {
            // Arrange
            const errorMessage = "Failed to test connection";

            testConnectionStub.rejects(new Error(errorMessage));

            // Act
            const result: CommandResult<TestConnectionResult> = await handler.execute({});

            // Assert
            expect(result.success).to.equal(false);
            expect(result.data).to.equal(undefined);
            expect(result.error).to.equal(errorMessage);
        });

        it("should return error result when service throws string", async () => {
            // Arrange
            const errorMessage = "String error message";

            testConnectionStub.throws(errorMessage);

            // Act
            const result: CommandResult<TestConnectionResult> = await handler.execute({});

            // Assert
            expect(result.success).to.equal(false);
            expect(result.data).to.equal(undefined);
            expect(result.error).to.equal("Sinon-provided String error message");
        });

        it("should handle non-Error non-string exceptions", async () => {
            // Arrange
            const errorObject = { code: 500, message: "Internal error" };

            testConnectionStub.rejects(errorObject);

            // Act
            const result: CommandResult<TestConnectionResult> = await handler.execute({});

            // Assert
            expect(result.success).to.equal(false);
            expect(result.data).to.equal(undefined);
            expect(result.error).to.equal("[object Object]");
        });

        it("should call TestConnection exactly once", async () => {
            // Arrange
            testConnectionStub.resolves({
                Status: "Success",
                Message: "Connected",
                Details: null,
            });

            // Act
            await handler.execute({});

            // Assert
            expect(testConnectionStub.calledOnce).to.equal(true);
        });
    });
});

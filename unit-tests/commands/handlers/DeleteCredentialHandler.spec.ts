/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { SinonStub, stub } from "sinon";
import { expect } from "chai";

import {
    DeleteCredentialHandler,
    DeleteCredentialResult,
} from "../../../src/commands/handlers/DeleteCredentialHandler";
import { GenericResult, IPQTestService } from "../../../src/common/PQTestService";
import { CommandResult } from "../../../src/commands/handlers/ICommandHandler";

describe("DeleteCredentialHandler", () => {
    let mockPqTestService: Partial<IPQTestService>;
    let deleteCredentialStub: SinonStub;
    let handler: DeleteCredentialHandler;

    beforeEach(() => {
        deleteCredentialStub = stub();

        mockPqTestService = {
            DeleteCredential: deleteCredentialStub,
        };

        handler = new DeleteCredentialHandler(mockPqTestService as IPQTestService);
    });

    describe("execute", () => {
        it("should return success result when service succeeds", async () => {
            // Arrange
            const mockResult: GenericResult = {
                Status: "Success",
                Message: "Credential deleted",
                Details: null,
            };

            deleteCredentialStub.resolves(mockResult);

            // Act
            const result: CommandResult<DeleteCredentialResult> = await handler.execute({});

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
                Message: "deleted",
                Details: null,
            };

            deleteCredentialStub.resolves(mockResult);

            // Act
            const result: CommandResult<DeleteCredentialResult> = await handler.execute({});

            // Assert
            expect(result.success).to.equal(true);
            expect(result.data!.formattedOutput).to.equal(JSON.stringify(mockResult, null, 2));
        });

        it("should return error result when service throws Error", async () => {
            // Arrange
            const errorMessage = "Failed to delete credential";

            deleteCredentialStub.rejects(new Error(errorMessage));

            // Act
            const result: CommandResult<DeleteCredentialResult> = await handler.execute({});

            // Assert
            expect(result.success).to.equal(false);
            expect(result.data).to.equal(undefined);
            expect(result.error).to.equal(errorMessage);
        });

        it("should return error result when service throws string", async () => {
            // Arrange
            const errorMessage = "String error message";

            deleteCredentialStub.throws(errorMessage);

            // Act
            const result: CommandResult<DeleteCredentialResult> = await handler.execute({});

            // Assert
            expect(result.success).to.equal(false);
            expect(result.data).to.equal(undefined);
            expect(result.error).to.equal("Sinon-provided String error message");
        });

        it("should handle non-Error non-string exceptions", async () => {
            // Arrange
            const errorObject = { code: 404, message: "Not found" };

            deleteCredentialStub.rejects(errorObject);

            // Act
            const result: CommandResult<DeleteCredentialResult> = await handler.execute({});

            // Assert
            expect(result.success).to.equal(false);
            expect(result.data).to.equal(undefined);
            expect(result.error).to.equal("[object Object]");
        });

        it("should call DeleteCredential exactly once", async () => {
            // Arrange
            deleteCredentialStub.resolves({});

            // Act
            await handler.execute({});

            // Assert
            expect(deleteCredentialStub.calledOnce).to.equal(true);
        });
    });
});

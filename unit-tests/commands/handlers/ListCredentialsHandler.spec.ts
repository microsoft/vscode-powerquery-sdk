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
    });
});

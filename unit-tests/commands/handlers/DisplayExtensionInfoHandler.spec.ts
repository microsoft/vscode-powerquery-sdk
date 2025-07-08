/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { createSandbox, SinonSandbox, SinonStub } from "sinon";
import { expect } from "chai";

import { ExtensionInfo, IPQTestService } from "../../../src/common/PQTestService";
import { DisplayExtensionInfoHandler } from "../../../src/commands/handlers/DisplayExtensionInfoHandler";

describe("DisplayExtensionInfoHandler", () => {
    let sandbox: SinonSandbox;
    let mockPqTestService: IPQTestService;
    let handler: DisplayExtensionInfoHandler;

    beforeEach(() => {
        sandbox = createSandbox();

        mockPqTestService = {
            DisplayExtensionInfo: sandbox.stub(),
        } as unknown as IPQTestService;
    });

    afterEach(() => {
        sandbox.restore();
    });

    function createMockExtensionInfo(name: string | null): ExtensionInfo {
        return {
            Source: "test",
            LibraryId: "test-library",
            ErrorStatus: null,
            Name: name,
            Version: "1.0.0",
            Metadata: {
                Version: "1.0.0",
            },
            Members: [],
            DataSources: [],
        };
    }

    describe("execute", () => {
        it("should return success with extension info and display text", async () => {
            // Arrange
            const mockExtensionInfo: ExtensionInfo[] = [
                createMockExtensionInfo("TestExtension1"),
                createMockExtensionInfo("TestExtension2"),
            ];

            (mockPqTestService.DisplayExtensionInfo as SinonStub).resolves(mockExtensionInfo);
            handler = new DisplayExtensionInfoHandler(mockPqTestService);

            // Act
            const result = await handler.execute({});

            // Assert
            expect(result.success).to.be.true;

            expect(result.data).to.deep.equal({
                extensions: mockExtensionInfo,
                displayText: "TestExtension1,TestExtension2",
            });
        });

        it("should filter out extensions with empty or null names", async () => {
            // Arrange
            const mockExtensionInfo: ExtensionInfo[] = [
                createMockExtensionInfo("TestExtension1"),
                createMockExtensionInfo(""),
                createMockExtensionInfo(null),
                createMockExtensionInfo("TestExtension2"),
            ];

            (mockPqTestService.DisplayExtensionInfo as SinonStub).resolves(mockExtensionInfo);
            handler = new DisplayExtensionInfoHandler(mockPqTestService);

            // Act
            const result = await handler.execute({});

            // Assert
            expect(result.success).to.be.true;
            expect(result.data?.displayText).to.equal("TestExtension1,TestExtension2");
        });

        it("should return error when DisplayExtensionInfo throws", async () => {
            // Arrange
            const error = new Error("Test error");
            (mockPqTestService.DisplayExtensionInfo as SinonStub).rejects(error);
            handler = new DisplayExtensionInfoHandler(mockPqTestService);

            // Act
            const result = await handler.execute({});

            // Assert
            expect(result.success).to.be.false;
            expect(result.error).to.equal("Test error");
        });

        it("should handle string errors", async () => {
            // Arrange
            const error = "String error";
            (mockPqTestService.DisplayExtensionInfo as SinonStub).rejects(error);
            handler = new DisplayExtensionInfoHandler(mockPqTestService, { featureUseServiceHost: false });

            // Act
            const result = await handler.execute({});

            // Assert
            expect(result.success).to.be.false;
            expect(result.error).to.equal("String error");
        });

        it("should handle empty extension info array", async () => {
            // Arrange
            (mockPqTestService.DisplayExtensionInfo as SinonStub).resolves([]);
            handler = new DisplayExtensionInfoHandler(mockPqTestService);

            // Act
            const result = await handler.execute({});

            // Assert
            expect(result.success).to.be.true;

            expect(result.data).to.deep.equal({
                extensions: [],
                displayText: "",
            });
        });
    });
});

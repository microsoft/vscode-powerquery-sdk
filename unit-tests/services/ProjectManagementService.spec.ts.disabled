/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as sinon from "sinon";

import { afterEach, beforeEach, describe, it } from "mocha";
import { expect } from "chai";

import { IProjectManagementService, ProjectManagementService } from "../../src/services/ProjectManagementService";
import { FileSystemService } from "../../src/services/FileSystemService";
import { UIService } from "../../src/services/UIService";

interface MockExtensionContext {
    extensionPath: string;
}

interface MockPqTestService {
    ExecuteBuildTaskAndAwaitIfNeeded: sinon.SinonStub;
}

interface MockOutputChannel {
    appendInfoLine: sinon.SinonStub;
}

describe("ProjectManagementService", () => {
    let projectService: IProjectManagementService;
    let mockExtensionContext: MockExtensionContext;
    let fileSystem: FileSystemService;
    let uiService: UIService;
    let mockPqTestService: MockPqTestService;
    let mockOutputChannel: MockOutputChannel;
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();

        // Create simple mocks
        mockExtensionContext = {
            extensionPath: "/test/extension/path",
        };

        mockPqTestService = {
            ExecuteBuildTaskAndAwaitIfNeeded: sandbox.stub().resolves(),
        };

        mockOutputChannel = {
            appendInfoLine: sandbox.stub(),
        };

        // Use real implementations for file system and UI (will be stubbed as needed)
        fileSystem = new FileSystemService();
        uiService = new UIService();

        projectService = new ProjectManagementService(
            mockExtensionContext as any,
            fileSystem,
            uiService,
            mockPqTestService as any,
            mockOutputChannel as any,
        );
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe("buildProject", () => {
        it("should delegate to pqTestService", async () => {
            // Act
            await projectService.buildProject();

            // Assert
            expect(mockPqTestService.ExecuteBuildTaskAndAwaitIfNeeded.calledOnce).to.equal(true);
        });

        it("should propagate build errors", async () => {
            // Arrange
            const buildError = new Error("Build failed");
            mockPqTestService.ExecuteBuildTaskAndAwaitIfNeeded.rejects(buildError);

            // Act & Assert
            try {
                await projectService.buildProject();
                expect.fail("Should have thrown an error");
            } catch (error) {
                expect(error).to.equal(buildError);
            }
        });
    });

    describe("interface compliance", () => {
        it("should implement IProjectManagementService interface", () => {
            expect(projectService).to.be.an("object");
            expect(projectService.createNewProject).to.be.a("function");
            expect(projectService.buildProject).to.be.a("function");
            expect(projectService.setupCurrentWorkspace).to.be.a("function");
            expect(projectService.promptToSetupCurrentWorkspaceIfNeeded).to.be.a("function");
        });
    });

    describe("createNewProject", () => {
        it("should be a function that returns a Promise", () => {
            expect(projectService.createNewProject).to.be.a("function");
            const result = projectService.createNewProject();
            expect(result).to.be.instanceof(Promise);
        });
    });

    describe("setupCurrentWorkspace", () => {
        it("should be a function that returns a Promise", () => {
            expect(projectService.setupCurrentWorkspace).to.be.a("function");
            const result = projectService.setupCurrentWorkspace();
            expect(result).to.be.instanceof(Promise);
        });
    });

    describe("promptToSetupCurrentWorkspaceIfNeeded", () => {
        it("should be a function that returns a Promise", async () => {
            expect(projectService.promptToSetupCurrentWorkspaceIfNeeded).to.be.a("function");
            const result = projectService.promptToSetupCurrentWorkspaceIfNeeded();
            expect(result).to.be.instanceof(Promise);
            await result; // Ensure it completes
        });
    });
});

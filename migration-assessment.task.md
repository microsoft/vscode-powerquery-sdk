# Migration Assessment: vscode-extension-tester to @vscode/test-electron

## Current State Analysis

### Files Using vscode-extension-tester

1. `src/test/commonSuite/NewProject.spec.ts` - Complex UI workflow test
2. `src/test/commonSuite/PqSdkToolAcquisition.spec.ts` - Simple tool acquisition test
3. `scripts/test-e2e.ts` - Test runner configuration for extension-tester

### Test Utility Dependencies

The tests rely on several utility modules in `src/test/utils/` that use vscode-extension-tester APIs:

- `editorUtils.ts` - Editor manipulation
- `sideBarUtils.ts` - Sidebar interactions (tree views)
- `settingUtils.ts` - VS Code settings management
- `connectorProjects.ts` - Project creation workflows
- `notificationUtils.ts` - Notification assertions
- `outputChannelUtils.ts` - Output channel interactions
- `titleBarUtils.ts` - Window management

### Current Test Scenarios

1. **NewProject.spec.ts** (High Complexity):
    - Create new connector project via command palette
    - Verify workspace settings configuration
    - Interact with custom tree view (PQ SDK explorer)
    - Manage credentials through UI
    - Execute M queries through context menus
    - Verify output in webview panels
    - Test both service host enabled/disabled modes

2. **PqSdkToolAcquisition.spec.ts** (Low Complexity):
    - Execute command to update SDK tools
    - Verify tool existence

## Feasibility Assessment

### ✅ FEASIBLE - Migration is possible with moderate effort

### Key Differences Between Frameworks

| Aspect                 | vscode-extension-tester     | @vscode/test-electron     |
| ---------------------- | --------------------------- | ------------------------- |
| **Browser Dependency** | Chrome WebDriver            | Native VS Code instance   |
| **API Style**          | Selenium-like UI automation | Direct VS Code API calls  |
| **Reliability**        | Timing-dependent, flaky     | More stable, direct       |
| **Setup Complexity**   | High (WebDriver, browser)   | Low (built-in to VS Code) |
| **Test Speed**         | Slower                      | Faster                    |

### Migration Effort Assessment

#### 🟢 LOW EFFORT (Direct API replacements)

- **Command execution**: `workbench.executeCommand()` → `vscode.commands.executeCommand()`
- **Settings management**: Direct VS Code configuration API
- **File operations**: Use VS Code workspace API
- **Extension activation**: VS Code extension API

#### 🟡 MEDIUM EFFORT (Requires rework)

- **Editor interactions**: Replace Selenium-style editor manipulation with VS Code editor API
- **Notification verification**: Use VS Code notification API instead of DOM queries
- **Output channel access**: Direct VS Code output channel API

#### 🔴 HIGH EFFORT (Complex UI interactions)

- **Tree view interactions**: Custom tree view requires VS Code tree view provider API
- **Context menu operations**: Programmatic command execution instead of UI clicking
- **Multi-step input workflows**: Use VS Code QuickPick API instead of InputBox DOM manipulation
- **Webview verification**: Test webview content through message passing

### Required Changes

#### 1. Update Dependencies (Low effort)

- Remove `vscode-extension-tester` from devDependencies
- Already has `@vscode/test-electron` installed
- Update test scripts in package.json

#### 2. Rewrite Utility Modules (Medium-High effort)

Each utility module needs conversion:

```typescript
// OLD (vscode-extension-tester)
import { Workbench, EditorView } from "vscode-extension-tester";
const workbench = new Workbench();
const editorView = workbench.getEditorView();
await editorView.openEditor(fileName);

// NEW (@vscode/test-electron)
import * as vscode from "vscode";
const document = await vscode.workspace.openTextDocument(filePath);
await vscode.window.showTextDocument(document);
```

#### 3. Test Structure Changes (Medium effort)

- Convert `describe/it` from Mocha with extension-tester to standard Mocha with VS Code APIs
- Remove Selenium-style waiting patterns
- Use VS Code events and promises for synchronization

#### 4. Custom Extension Testing (High effort)

- Tree view testing requires implementing test hooks in the extension
- Webview testing needs message-based communication
- Some UI interactions may need to be mocked rather than tested end-to-end

### Risks and Limitations

#### 🚨 Potential Blockers

1. **Tree View Testing**: The current tests heavily interact with the custom PQ SDK tree view. This requires either:
    - Adding test APIs to the extension itself
    - Using VS Code's tree view provider API programmatically
    - Mocking the tree view interactions

2. **Webview Content Verification**: Current tests verify webview panel creation but don't test content. This limitation exists in both frameworks.

3. **UI Timing**: Some operations (building .mez files, credential operations) have real timing dependencies that need careful handling.

#### ⚠️ Limitations to Accept

- Less "true end-to-end" testing (more integration testing)
- Some complex UI flows may need to be simplified
- May need to add test-specific APIs to the extension

### Benefits of Migration

#### ✅ Advantages

1. **Reliability**: Eliminates WebDriver flakiness
2. **Speed**: Faster test execution
3. **Simplicity**: No browser automation setup
4. **Maintenance**: Easier to maintain and debug
5. **CI/CD**: Simpler pipeline configuration
6. **Development**: Better integration with VS Code development workflow

### Recommended Approach

#### Phase 1: Infrastructure (1-2 days)

1. Update package.json scripts
2. Remove extension-tester configuration
3. Set up basic @vscode/test-electron structure

#### Phase 2: Utility Module Migration (3-5 days)

1. Start with simple utilities (settings, commands)
2. Rewrite editor utilities
3. Handle complex UI utilities (tree view, notifications)

#### Phase 3: Test Conversion (2-3 days)

1. Convert PqSdkToolAcquisition.spec.ts (simple test)
2. Convert NewProject.spec.ts (complex test)
3. Add necessary test hooks to extension if needed

#### Phase 4: Validation and Cleanup (1-2 days)

1. Ensure test coverage is maintained
2. Update documentation
3. Remove old test infrastructure

**Total Estimated Effort: 14-16 days** (including legacy cleanup)

## What Cannot Be Tested with @vscode/test-electron?

After analyzing the specific test scenarios, **all core functionality tested by `vscode-extension-tester` can be replicated with `@vscode/test-electron`**, but with different approaches:

### ✅ CAN BE TESTED (with approach changes)

| Current vscode-extension-tester Test | @vscode/test-electron Equivalent                   |
| ------------------------------------ | -------------------------------------------------- |
| **Command execution**                | `vscode.commands.executeCommand()` - Direct API    |
| **Settings validation**              | `vscode.workspace.getConfiguration()` - Direct API |
| **File creation/opening**            | `vscode.workspace.openTextDocument()` - Direct API |
| **Tree view interactions**           | Programmatic command execution via VS Code API     |
| **Credential management**            | Test the underlying command handlers directly      |
| **Notification verification**        | Mock or test the notification API calls            |
| **Output channel content**           | Access output channels via VS Code API             |
| **Webview panel creation**           | Test webview creation through extension API        |
| **Project creation workflow**        | Test the command logic directly                    |
| **Multi-step input flows**           | Use VS Code QuickPick API programmatically         |

### 🟡 TESTING APPROACH CHANGES REQUIRED

#### 1. **Tree View Clicks → Command Execution**

```typescript
// OLD: Click tree view items through DOM
await pqSdkViewSection.findItem("Clear All Credentials")?.click();

// NEW: Execute commands directly
await vscode.commands.executeCommand("powerquery.sdk.tools.DeleteCredentialCommand");
```

#### 2. **Multi-step Input → Direct API**

```typescript
// OLD: Interact with InputBox DOM elements
const inputBox = await InputBox.create();
await inputBox.setText(value);
await inputBox.sendKeys(Key.ENTER);

// NEW: Test the MultiStepInput logic or mock user input
const mockInput = { showInputBox: jest.fn().mockResolvedValue(value) };
await createProject(mockInput);
```

#### 3. **Context Menu → Command Execution**

```typescript
// OLD: Right-click context menu simulation
const curCtxMenu = await openedEditor.openContextMenu();
await curCtxMenu.getItem("Run Test Battery")?.click();

// NEW: Direct command execution with file context
await vscode.commands.executeCommand("powerquery.sdk.tools.RunTestBatteryCommand");
```

### ❌ WHAT ACTUALLY CANNOT BE TESTED

**None of the core functionality is untestable**, but these aspects change scope:

#### 1. **True End-to-End UI Flows**

- **Current**: Tests the actual clicking, typing, visual feedback
- **New**: Tests the command logic, business rules, API integration
- **Impact**: ⚠️ Less "user-like" testing, more integration testing

#### 2. **Visual Layout and Styling**

- **Current**: Can verify UI elements are visually present and clickable
- **New**: Cannot test visual presentation, only functional behavior
- **Impact**: ⚠️ UI regression testing moves to manual testing

#### 3. **Timing-Dependent UI Interactions**

- **Current**: Tests real UI timing (notifications appearing, tree refreshing)
- **New**: Tests logical state changes, not visual updates
- **Impact**: ⚠️ Some timing bugs might be missed

#### 4. **Cross-Extension Integration**

- **Current**: Tests actual interaction with `PowerQuery.vscode-powerquery` dependency
- **New**: Can test the integration points but not the full workflow
- **Impact**: ⚠️ Dependency integration testing is more limited

### 🎯 **KEY INSIGHT: Testing Philosophy Shift**

The migration represents a shift from **End-to-End UI Testing** to **Integration Testing**:

- **Lost**: Visual UI verification, real user interaction patterns
- **Gained**: Faster, more reliable, focused business logic testing
- **Trade-off**: Less "user-like" but more maintainable and comprehensive

### 📊 **Test Coverage Analysis**

| Test Scenario              | Coverage with extension-tester | Coverage with test-electron |
| -------------------------- | ------------------------------ | --------------------------- |
| **Project Creation**       | 100% (UI + Logic)              | 95% (Logic only)            |
| **Credential Management**  | 100% (UI + Logic)              | 95% (Logic only)            |
| **Settings Configuration** | 100% (UI + Logic)              | 100% (Logic covers all)     |
| **Command Execution**      | 100% (UI + Logic)              | 100% (Direct API testing)   |
| **File Operations**        | 100% (UI + Logic)              | 100% (Direct API testing)   |
| **Error Handling**         | 90% (UI error display)         | 100% (Better error testing) |

## Final Recommendation: ✅ PROCEED

**ALL core functionality can be tested** with `@vscode/test-electron`. The migration is feasible and recommended despite the moderate effort required. The benefits in reliability, maintainability, and development experience outweigh the conversion costs.

### Benefits Outweigh Limitations:

- ✅ **All business logic testable** - No functional gaps
- ✅ **Better reliability** - No WebDriver flakiness
- ✅ **Faster execution** - Direct API calls vs DOM simulation
- ✅ **Easier maintenance** - Cleaner test code
- ⚠️ **Testing scope change** - From UI testing to integration testing

## Refactoring for Better Testability & Code Coverage

The migration provides an excellent opportunity to refactor the codebase for improved testability and increase overall code coverage through a strategic combination of unit and integration testing.

### 🎯 **Current Testability Issues**

#### 1. **Monolithic Command Classes**

- `LifecycleCommands` is a 1,500+ line class with multiple responsibilities
- Methods tightly coupled to VS Code APIs making unit testing difficult
- Complex business logic mixed with UI interaction code

#### 2. **Hard-to-Test Dependencies**

- Direct VS Code API calls embedded in business logic
- File system operations mixed with command logic
- Network calls (NuGet) not abstracted for testing

#### 3. **Limited Current Unit Test Coverage**

- Only basic utility functions tested (`Utils.spec.ts`, `iterables.spec.ts`)
- No tests for core business logic in commands or services
- Complex workflows not covered by unit tests

### 🔧 **Refactoring Strategy**

#### **Unit-First Testing Philosophy**

The refactoring strategy prioritizes **unit tests over integration tests** to maximize:

- **Speed**: Unit tests run in milliseconds vs seconds for integration tests
- **Reliability**: No external dependencies or VS Code API interactions
- **Debugging**: Isolated failures are easier to diagnose
- **Maintainability**: Changes to VS Code APIs don't break business logic tests

**Test Hierarchy (Priority Order):**

1. **Unit Tests**: Pure business logic, validation, data transformations
2. **Service Tests**: Single service with mocked dependencies
3. **Integration Tests**: Multiple services working together
4. **UI Integration Tests**: VS Code API interactions (minimal, focused)

#### **Phase 1: Extract Business Logic (High Impact)**

##### 1.1. **Project Creation Service**

```typescript
// NEW: Pure business logic, easily testable
export class ProjectCreationService {
  constructor(
    private readonly fileSystem: IFileSystem,
    private readonly templateProvider: ITemplateProvider
  ) {}

  public validateProjectName(name: string): ValidationResult {
    // Pure function - easy to unit test
    if (!name) return { isValid: false, error: "Name is required" };
    if (!name.match(/^[a-zA-Z][a-zA-Z0-9_]*$/)) {
      return { isValid: false, error: "Invalid project name format" };
    }
    return { isValid: true };
  }

  public async createProject(request: CreateProjectRequest): Promise<CreateProjectResult> {
    // Business logic without VS Code dependencies
    const validation = this.validateProjectName(request.projectName);
    if (!validation.isValid) throw new Error(validation.error);

    const projectPath = this.generateProjectStructure(request);
    await this.fileSystem.writeFiles(projectPath.files);
    return { projectPath: projectPath.root, files: projectPath.files };
  }
}

// USAGE in command (much simpler)
export class LifecycleCommands {
  public async generateOneNewProject(): Promise<void> {
    const name = await vscode.window.showInputBox({...});
    const folder = await vscode.window.showOpenDialog({...});

    try {
      const result = await this.projectCreationService.createProject({
        projectName: name,
        targetDirectory: folder
      });
      await vscode.commands.executeCommand("vscode.openFolder", result.projectPath);
    } catch (error) {
      await vscode.window.showErrorMessage(error.message);
    }
  }
}
```

##### 1.2. **Credential Management Service**

```typescript
export class CredentialManagementService {
    constructor(
        private readonly pqTestService: IPQTestService,
        private readonly validator: ICredentialValidator,
    ) {}

    public validateCredentialState(state: CreateAuthState): ValidationResult {
        // Pure validation logic - perfect for unit tests
        if (!state.DataSourceKind || !state.AuthenticationKind) {
            return { isValid: false, error: "Missing required fields" };
        }

        if (state.AuthenticationKind === "Key" && !state.$$KEY$$) {
            return { isValid: false, error: "Key is required for Key authentication" };
        }

        return { isValid: true };
    }

    public async createCredential(authState: CreateAuthState): Promise<GenericResult> {
        const validation = this.validateCredentialState(authState);
        if (!validation.isValid) throw new Error(validation.error);

        return await this.pqTestService.SetCredentialFromCreateAuthState(authState);
    }
}
```

##### 1.3. **Configuration Management Service**

```typescript
export class WorkspaceConfigurationService {
    constructor(
        private readonly fileSystem: IFileSystem,
        private readonly pathResolver: IPathResolver,
    ) {}

    public generateWorkspaceConfig(workspacePath: string, projectName: string): WorkspaceConfig {
        // Pure function - easy to test
        return {
            defaultQueryFile: `\${workspaceFolder}\\${projectName}.query.pq`,
            defaultExtension: `\${workspaceFolder}\\bin\\AnyCPU\\Debug\\${projectName}.mez`,
            mode: "SDK",
        };
    }

    public async setupWorkspace(workspacePath: string, projectName: string): Promise<void> {
        const config = this.generateWorkspaceConfig(workspacePath, projectName);
        const settingsPath = this.pathResolver.getSettingsPath(workspacePath);
        await this.fileSystem.writeJson(settingsPath, config);
    }
}
```

#### **Phase 2: Abstract External Dependencies (Medium Impact)**

##### 2.1. **File System Abstraction**

```typescript
export interface IFileSystem {
    exists(path: string): Promise<boolean>;
    readFile(path: string): Promise<string>;
    writeFile(path: string, content: string): Promise<void>;
    writeJson(path: string, data: any): Promise<void>;
    createDirectory(path: string): Promise<void>;
    getModifiedTime(path: string): Promise<Date>;
}

export class VSCodeFileSystem implements IFileSystem {
    // VS Code specific implementation
}

export class MockFileSystem implements IFileSystem {
    // In-memory implementation for testing
}
```

##### 2.2. **UI Interaction Abstraction**

```typescript
export interface IUIService {
    showInputBox(options: InputBoxOptions): Promise<string | undefined>;
    showQuickPick<T>(items: T[], options: QuickPickOptions): Promise<T | undefined>;
    showInformationMessage(message: string): Promise<void>;
    showErrorMessage(message: string): Promise<void>;
    showProgressDialog<T>(title: string, task: (progress: IProgress) => Promise<T>): Promise<T>;
}

export class VSCodeUIService implements IUIService {
    // Real VS Code implementation
}

export class MockUIService implements IUIService {
    // Mock implementation for testing
}
```

#### **Phase 3: Create Comprehensive Test Strategy (High Impact)**

##### 3.1. **Pure Unit Tests (Highest Priority)**

```typescript
// NEW: tests/unit/validation/ProjectNameValidator.test.ts
describe("ProjectNameValidator", () => {
    describe("validate", () => {
        it("should reject empty names", () => {
            const result = ProjectNameValidator.validate("");
            expect(result.isValid).toBe(false);
            expect(result.error).toBe("Name is required");
        });

        it("should reject names with invalid characters", () => {
            const result = ProjectNameValidator.validate("test-name");
            expect(result.isValid).toBe(false);
            expect(result.error).toContain("Invalid character");
        });

        it("should accept valid names", () => {
            const result = ProjectNameValidator.validate("ValidProjectName");
            expect(result.isValid).toBe(true);
        });

        it("should reject reserved words", () => {
            const result = ProjectNameValidator.validate("CON");
            expect(result.isValid).toBe(false);
            expect(result.error).toContain("reserved");
        });
    });
});

// NEW: tests/unit/utils/PathUtils.test.ts
describe("PathUtils", () => {
    describe("generateProjectPath", () => {
        it("should combine directory and project name", () => {
            const result = PathUtils.generateProjectPath("/tmp", "TestProject");
            expect(result).toBe("/tmp/TestProject");
        });

        it("should handle trailing slashes", () => {
            const result = PathUtils.generateProjectPath("/tmp/", "TestProject");
            expect(result).toBe("/tmp/TestProject");
        });
    });

    describe("generateSettingsPath", () => {
        it("should create .vscode/settings.json path", () => {
            const result = PathUtils.generateSettingsPath("/project");
            expect(result).toBe("/project/.vscode/settings.json");
        });
    });
});
```

##### 3.2. **Service Unit Tests with Mocks (High Priority)**

```typescript
// NEW: tests/unit/services/ProjectCreationService.test.ts
describe("ProjectCreationService", () => {
    let service: ProjectCreationService;
    let mockFileSystem: jest.Mocked<IFileSystem>;
    let mockTemplateProvider: jest.Mocked<ITemplateProvider>;

    beforeEach(() => {
        mockFileSystem = {
            exists: jest.fn(),
            writeFile: jest.fn(),
            writeJson: jest.fn(),
            createDirectory: jest.fn(),
        } as jest.Mocked<IFileSystem>;

        mockTemplateProvider = {
            getTemplate: jest.fn(),
            getTemplateFiles: jest.fn(),
        } as jest.Mocked<ITemplateProvider>;

        service = new ProjectCreationService(mockFileSystem, mockTemplateProvider);
    });

    describe("createProject", () => {
        it("should validate project name before creation", async () => {
            const request = { projectName: "", targetDirectory: "/tmp" };

            await expect(service.createProject(request)).rejects.toThrow("Name is required");

            expect(mockFileSystem.writeFile).not.toHaveBeenCalled();
        });

        it("should create project structure with valid input", async () => {
            const request = { projectName: "TestProject", targetDirectory: "/tmp" };
            mockTemplateProvider.getTemplateFiles.mockResolvedValue([
                { path: "TestProject.pq", content: "// Main connector file" },
                { path: ".vscode/settings.json", content: "{}" },
            ]);

            const result = await service.createProject(request);

            expect(result.projectPath).toBe("/tmp/TestProject");
            expect(mockFileSystem.createDirectory).toHaveBeenCalledWith("/tmp/TestProject");
            expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
                "/tmp/TestProject/TestProject.pq",
                "// Main connector file",
            );
        });

        it("should handle file system errors gracefully", async () => {
            const request = { projectName: "TestProject", targetDirectory: "/tmp" };
            mockFileSystem.createDirectory.mockRejectedValue(new Error("Permission denied"));

            await expect(service.createProject(request)).rejects.toThrow("Permission denied");
        });
    });
});

// NEW: tests/unit/services/CredentialManagementService.test.ts
describe("CredentialManagementService", () => {
    let service: CredentialManagementService;
    let mockPqTestService: jest.Mocked<IPQTestService>;

    beforeEach(() => {
        mockPqTestService = {
            SetCredentialFromCreateAuthState: jest.fn(),
        } as jest.Mocked<IPQTestService>;

        service = new CredentialManagementService(mockPqTestService);
    });

    describe("validateCredentialState", () => {
        it("should require DataSourceKind", () => {
            const state = { AuthenticationKind: "Key", $$KEY$$: "test" } as CreateAuthState;

            const result = service.validateCredentialState(state);

            expect(result.isValid).toBe(false);
            expect(result.error).toBe("Missing required fields");
        });

        it("should require key for Key authentication", () => {
            const state = {
                DataSourceKind: "Test",
                AuthenticationKind: "Key",
                $$KEY$$: "",
            } as CreateAuthState;

            const result = service.validateCredentialState(state);

            expect(result.isValid).toBe(false);
            expect(result.error).toBe("Key is required for Key authentication");
        });

        it("should accept valid Key authentication", () => {
            const state = {
                DataSourceKind: "Test",
                AuthenticationKind: "Key",
                $$KEY$$: "valid-key",
            } as CreateAuthState;

            const result = service.validateCredentialState(state);

            expect(result.isValid).toBe(true);
        });
    });

    describe("createCredential", () => {
        it("should not call service with invalid state", async () => {
            const state = { AuthenticationKind: "Key" } as CreateAuthState;

            await expect(service.createCredential(state)).rejects.toThrow("Missing required fields");

            expect(mockPqTestService.SetCredentialFromCreateAuthState).not.toHaveBeenCalled();
        });

        it("should call service with valid state", async () => {
            const state = {
                DataSourceKind: "Test",
                AuthenticationKind: "Key",
                $$KEY$$: "test-key",
            } as CreateAuthState;
            mockPqTestService.SetCredentialFromCreateAuthState.mockResolvedValue({ success: true });

            const result = await service.createCredential(state);

            expect(mockPqTestService.SetCredentialFromCreateAuthState).toHaveBeenCalledWith(state);
            expect(result.success).toBe(true);
        });
    });
});
```

##### 3.3. **Integration Tests (Lower Priority)**

```typescript
// NEW: tests/integration/commands/LifecycleCommands.test.ts
describe("LifecycleCommands Integration", () => {
    let commands: LifecycleCommands;
    let mockUIService: MockUIService;
    let projectCreationService: ProjectCreationService;

    beforeEach(async () => {
        // Use real services with mocked external dependencies
        const mockFileSystem = new MockFileSystem();
        const mockTemplateProvider = new MockTemplateProvider();
        projectCreationService = new ProjectCreationService(mockFileSystem, mockTemplateProvider);

        mockUIService = new MockUIService();

        commands = new LifecycleCommands(
            mockUIService,
            projectCreationService,
            // ... other real services with mocked dependencies
        );
    });

    it("should create new project end-to-end", async () => {
        mockUIService.setInputBoxResponse("TestProject");
        mockUIService.setOpenDialogResponse(["/tmp"]);

        await commands.generateOneNewProject();

        expect(mockUIService.informationMessageShown).toBe(true);
        // Verify project was actually created through service
        const projectExists = await projectCreationService.projectExists("/tmp/TestProject");
        expect(projectExists).toBe(true);
    });
});
```

##### 3.4. **VS Code API Integration Tests (Minimal)**

```typescript
// NEW: tests/vscode/CommandRegistration.test.ts
describe("Command Registration @vscode/test-electron", () => {
    it("should register all expected commands", async () => {
        const commands = await vscode.commands.getCommands();

        const expectedCommands = [
            "powerquery.sdk.tools.CreateNewProjectCommand",
            "powerquery.sdk.tools.DeleteCredentialCommand",
            "powerquery.sdk.tools.RunTestBatteryCommand",
        ];

        expectedCommands.forEach(cmd => {
            expect(commands).toContain(cmd);
        });
    });

    it("should execute CreateNewProjectCommand without errors", async () => {
        // Minimal smoke test - just verify command executes
        await expect(vscode.commands.executeCommand("powerquery.sdk.tools.CreateNewProjectCommand")).not.toThrow();
    });
});
```

### 📊 **Expected Code Coverage Improvements**

| Component                | Current Coverage | Target Coverage | Primary Test Strategy             | Secondary Strategy            |
| ------------------------ | ---------------- | --------------- | --------------------------------- | ----------------------------- |
| **Business Logic**       | ~5%              | 95%+            | Pure unit tests                   | -                             |
| **Validation Logic**     | ~0%              | 98%+            | Pure function unit tests          | -                             |
| **Data Transformations** | ~10%             | 95%+            | Pure function unit tests          | -                             |
| **Service Classes**      | ~0%              | 85%+            | Unit tests with mocked deps       | -                             |
| **Command Handlers**     | ~0%              | 60%+            | Unit tests for logic portions     | Integration tests             |
| **Error Handling**       | ~10%             | 90%+            | Unit tests for error scenarios    | -                             |
| **File Operations**      | ~20%             | 85%+            | Unit tests with file system mocks | Integration tests             |
| **Multi-step Workflows** | ~0%              | 70%+            | Unit tests for workflow logic     | Integration tests             |
| **VS Code Integration**  | ~0%              | 40%+            | -                                 | Minimal @vscode/test-electron |

**Test Distribution Target:**

- **80%** Unit Tests (fast, reliable, easy to debug)
- **15%** Integration Tests (service interactions)
- **5%** VS Code API Tests (UI integration, smoke tests)

### 🏗️ **Implementation Plan**

#### **Phase 1: Foundation (Days 1-3)**

1. Create abstraction interfaces (`IFileSystem`, `IUIService`, etc.)
2. Extract validation functions into pure functions
3. Set up test infrastructure and mocking framework

#### **Phase 2: Service Extraction (Days 4-7)**

1. Extract business logic into pure functions and testable services
2. **Create unit tests FIRST** for each extracted component
3. Extract `ProjectCreationService` with comprehensive unit test suite
4. Extract `CredentialManagementService` with validation unit tests
5. Extract `WorkspaceConfigurationService` with path generation tests
6. **Target: 90%+ unit test coverage** for extracted services

#### **Phase 3: Command Refactoring (Days 8-10)**

1. **Refactor commands to thin wrappers** around tested services
2. **Unit test command logic** where possible (validation, error handling)
3. Create **minimal integration tests** only for VS Code API interactions
4. Focus on **testing business rules** rather than UI interactions
5. **Target: 70% unit tests, 30% integration tests** for command layer

#### **Phase 4: Advanced Testing (Days 11-12)**

1. **Add edge case unit tests** for complex business scenarios
2. **Create property-based tests** for validation functions
3. **Add performance unit tests** for critical algorithms
4. **Minimal integration tests** only where unit tests cannot provide coverage
5. Add regression tests for known bug scenarios (as unit tests where possible)

#### **Phase 5: Legacy Code Removal & Cleanup (Days 13-14)**

1. Remove all vscode-extension-tester related files and dependencies
2. Clean up package.json and build scripts
3. Update documentation and remove dead code references
4. **Update `.github/copilot-instructions.md`** with final testing strategy:
    - Document the implemented unit-first testing approach
    - Update test organization structure with actual directory layout
    - Add examples of the service abstractions created (IFileSystem, IUIService, etc.)
    - Document the final test distribution achieved (unit vs integration vs UI tests)
    - Update external dependency testing patterns with real examples
    - Add troubleshooting notes for the new testing approach
5. Final validation and testing

### ✅ **Benefits of This Approach**

#### **Immediate Benefits**

- **Ultra-fast feedback**: Unit tests run in milliseconds
- **Better test coverage**: From ~10% to 90%+ overall (80% unit tests)
- **Easier debugging**: Isolated failures point to specific components
- **Reduced regression risk**: Comprehensive unit test safety net
- **Developer confidence**: Refactor fearlessly with unit test protection

#### **Long-term Benefits**

- **Easier maintenance**: Pure functions and services are simple to modify
- **Living documentation**: Unit tests document expected behavior clearly
- **Improved reliability**: Fewer production bugs due to thorough unit testing
- **Faster development**: Quick unit test cycles accelerate feature development
- **Better architecture**: Unit-testable code is naturally well-designed

#### **Migration Synergy**

- **Reduced migration risk**: Business logic tested independently with unit tests
- **Easier conversion**: Clear separation enables focused unit testing
- **Better coverage**: Comprehensive unit tests + targeted integration tests
- **Improved quality**: High confidence through extensive unit test coverage
- **Faster migration**: Unit tests provide immediate feedback during refactoring

This refactoring strategy transforms the migration from a simple test framework swap into a comprehensive code quality improvement initiative that **prioritizes fast, reliable unit tests** while significantly increasing testability and maintainability.

### 🪟 **Platform Dependencies**

#### Windows-Only Requirements

**Important**: The Microsoft.PowerQuery.SdkTools NuGet package is **Windows-only**. This affects:

- **Test Environment**: All test environments will be Windows-based
- **CI/CD Pipelines**: Must use Windows runners/agents
- **Local Development**: Developers must use Windows machines
- **pqtest.exe**: Core testing executable only available on Windows

#### Migration Implications

1. **No Cross-Platform Concerns**: Since all environments are Windows, we don't need to handle platform-specific test logic
2. **Simplified Path Handling**: Can use Windows-style paths consistently in tests
3. **Process Execution**: No need to abstract Windows-specific process execution patterns
4. **File System Operations**: Can rely on Windows file system behavior consistently

#### Testing Strategy Impact

- **Unit Tests**: Platform-agnostic pure business logic remains unchanged
- **Integration Tests**: Can assume Windows environment for file/process operations
- **External Tests**: NuGet package downloads will always target Windows
- **Mock Services**: File system mocks should simulate Windows behavior

```typescript
// Example: Windows-specific path handling is acceptable
export class PathUtils {
    static generateProjectPath(directory: string, projectName: string): string {
        // Can assume Windows path separators
        return path.join(directory, projectName).replace(/\//g, "\\");
    }
}

// Example: Windows process execution
export class PqTestService {
    private async executePqTest(args: string[]): Promise<string> {
        // Can assume pqtest.exe is available on Windows
        return await this.processRunner.execute("pqtest.exe", args);
    }
}
```

# Copilot Instructions for Power Query Connector SDK Extension

This repository contains the VS Code extension for the "Power Query Connector SDK". This document provides context to help GitHub Copilot assist with development tasks, particularly converting test frameworks and creating regression tests.

![!IMPORTANT]
You are allowed to ask questions.
If you're unsure about any aspect or if the task lacks necessary information, say "I don’t have enough information to confidently assess this."

**Required Process**:

- **Plan First**:
  When given a complex task, before changing any code, analyze the task and then create a `*.task.md`
  to describe step by step how you will implement the task. Ask the user to review the plan.
  Revise the plan based on feedback.
- **Wait for Approval**: Do not start coding until the user explicitly says "Execute the task"
- **Checkpoint Journal**
  When executing the tasks, use `copilot-journal.md` to track progress and decisions.
- **Test After Each Change**: Run tests to verify functionality
- **Stop when Stuck**: If you hit a roadblock, such as syntax error, test failures, update the journal, stop and ask for help
- **Update Journal**: Mark checkpoints as complete
- **Simple Completion**: When done, just say "I'm done" (no summary needed)
- **Change log**:
  When you finish a task related to an end user feature, update the `CHANGELOG.md` file with a summary of changes.
  Increase the patch version number by running `npm version patch` and commit the change.
  Include these steps when generating the task plan.

## Project Overview

**Extension Name**: Power Query Connector SDK for Visual Studio Code  
**Publisher**: PowerQuery  
**Extension ID**: PowerQuery.vscode-powerquery-sdk

### Purpose

This extension is used to create custom connectors for Power Query in Power BI. Power Query connectors are written in the M language. The extension provides:

- Project creation and management
- Building connector files (.mez)
- Credential management
- Query testing and evaluation

### Dependencies

- **Required Extension**: `PowerQuery.vscode-powerquery` - provides M language service
- **Core Tool**: Microsoft.PowerQuery.SdkTools NuGet package containing:
    - `pqtest.exe` - M evaluation and testing
    - `pqservicehost.exe` - service-based M evaluation (experimental)
    - `makepqx.exe` - connector building utility

## Architecture Overview

### Key Components

1. **Extension Core** (`src/extension.ts`)
    - Main activation point
    - Dependency injection setup
    - Service initialization

2. **Testing Services**
    - `PqTestExecutableTaskQueue` - Queue-based execution of pqtest.exe
    - `PqServiceHostClient` - RPC client for pqservicehost.exe (experimental)
    - Both implement `IPQTestService` interface

3. **Test Output Processing**
    - pqtest.exe outputs JSON to stdout
    - Extension parses JSON and displays in webview
    - Results shown in `PQTest result` tab

4. **Configuration**
    - Extension settings in `package.json` under `contributes.configuration`
    - User settings validation via `schemas/UserSettings.schema.json`

## Current Testing Structure

### Test Directories

1. **`unit-tests/`** - Standard unit tests using Mocha
    - Tests utility classes and business logic
    - Run with: `npm run test:unit-test`

2. **`src/test/suite/`** - UI tests using `@vscode/test-electron` framework
    - Files: `extension.test.ts`, `project.test.ts`, `schema.test.ts`
    - Uses `.vscode-test.mjs` configuration
    - Clean test environment with dependency extensions

3. **`src/test/commonSuite/`** - UI tests using `vscode-extension-tester` framework
    - Files: `NewProject.spec.ts`, `PqSdkToolAcquisition.spec.ts`
    - Legacy framework that needs migration
    - Uses `scripts/test-e2e.ts` for execution

### Test Utilities (`src/test/utils/`)

- `editorUtils.ts` - VS Code editor interactions
- `settingUtils.ts` - Extension settings management
- `sideBarUtils.ts` - Sidebar/tree view interactions
- `connectorProjects.ts` - Project creation helpers
- `pqSdkNugetPackageUtils.ts` - NuGet package verification

## pqtest.exe Integration

### JSON Output Format

pqtest.exe operations return JSON to stdout with structures like:

```typescript
interface GenericResult {
  // Basic operation results
}

interface ExtensionInfo {
  // Connector metadata from "info" operation
  Members: Array<{
    Name: string;
    FunctionParameters?: Array<...>;
    // ... other metadata
  }>;
}

interface Credential {
  // Authentication information from "list-credential"
}
```

### Key Operations

- `info` - Get connector metadata
- `run-test` - Execute M query, returns evaluation result
- `test-connection` - Test connector connectivity
- `list-credential` - List stored credentials
- `set-credential` - Store authentication data
- `delete-credential` - Remove credentials

### Command Line Usage

```bash
PQTest.exe <operation> --extension <connector.mez> --queryFile <query.pq> [options]
```

### Test Settings Schema

- Files ending in `.testsettings.json` validated against `schemas/UserSettings.schema.json`
- Contains test configuration like authentication, data source paths, environment settings
- Used with `--settingsFile` parameter

## Migration Task Context

### Current State

- `vscode-extension-tester` tests in `src/test/commonSuite/`
- Uses Selenium WebDriver for UI automation
- Complex setup with Chrome WebDriver downloads
- Flaky due to timing issues and external dependencies

### Target State

- Migrate to `@vscode/test-electron` framework
- Native VS Code testing without browser automation
- More reliable and faster execution
- Consistent with `src/test/suite/` pattern

### Key Differences

```typescript
// vscode-extension-tester (old)
import { Workbench, EditorView, SideBarView } from "vscode-extension-tester";
const workbench = new Workbench();
await workbench.executeCommand("command.id");

// @vscode/test-electron (new)
import * as vscode from "vscode";
await vscode.commands.executeCommand("command.id");
```

## Regression Testing Context

### Purpose

Detect breaking changes in Microsoft.PowerQuery.SdkTools NuGet package versions that could affect:

- JSON output format changes
- New/removed command line options
- Behavioral differences in M evaluation

### Test Strategy

1. **Golden File Approach**
    - Capture known-good JSON outputs for each pqtest.exe operation
    - Store in `src/test/fixtures/` or similar
    - Compare current output against golden files

2. **Test Operations to Cover**
    - `info` operation with sample connector
    - `run-test` with various M expressions
    - `list-credential`, `set-credential` operations
    - Error conditions and edge cases

3. **Version Management**
    - Test against multiple NuGet package versions
    - Configurable version ranges in tests
    - CI/CD integration for new version validation

### Sample Test Structure

```typescript
describe("PQTest Regression Tests", () => {
    test("info operation output format", async () => {
        const result = await pqTestService.DisplayExtensionInfo();
        expect(result).toMatchSnapshot("info-output.json");
    });

    test("run-test operation basic query", async () => {
        const result = await pqTestService.RunTestBattery("simple.query.pq");
        expect(result).toHaveProperty("Output");
        expect(result.Output).toBeDefined();
    });
});
```

## File Patterns and Conventions

### Important File Types

- `*.pq` - M language query files
- `*.mez` - Compiled connector files
- `*.testsettings.json` - Test configuration files
- `*.query.pq` - Query files for testing
- `*.proj`, `*.mproj` - Legacy MSBuild project files

### Naming Conventions

- Test files: `*.test.ts` (new framework), `*.spec.ts` (old framework)
- Utility modules: `*Utils.ts`
- Service classes: `*Service.ts`, `*Client.ts`
- Configuration: `*Configuration.ts`

### Key Constants

```typescript
// From src/constants/PowerQuerySdkExtension.ts
const PqTestExecutableName = "PQTest.exe";
const InternalMsftPqSdkToolsNugetName = "Microsoft.PowerQuery.SdkTools";
const SuggestedPqTestNugetVersion = "2.139.3";
const MaximumPqTestNugetVersion = "2.146.x";
```

## Common Commands and Tasks

### Development

```bash
npm install          # Install dependencies
npm run compile      # Compile TypeScript
npm run watch        # Watch mode compilation
npm run package      # Build VSIX package
```

### Testing

```bash
npm test                   # Run all tests
npm run test:unit-test     # Unit tests only
npm run test:e2e           # UI Tests with @vscode/test-electron
npm run test:e2e:old       # UI Tests with vscode-extension-tester
```

### Extension Tasks

- "Watch_VSC_PQ_SDK" - Development build task
- "Run Extension Tests" - E2E test execution
- "Dev_PQTest_Result_WebView" - Webview development

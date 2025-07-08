# Task: Reduce Test Code Duplication with Shared Constants and Helpers

## Overview

Refactor test code to use shared constants for command names, extension IDs, view IDs, and common test patterns to reduce duplication and improve maintainability.

## Analysis of Current State

### Repeated Constants Found:

1. **Command Names**: `powerquery.sdk.tools.*` commands scattered across tests
2. **Extension IDs**: `PowerQuery.vscode-powerquery-sdk`, `powerquery.vscode-powerquery`
3. **View IDs**: `powerquery.sdk.tools.LifeCycleTaskTreeView`, `powerquery.sdk.tools.ResultWebView`
4. **Webview Types**: `powerquery.sdk.tools.ResultWebView`

### Repeated Test Patterns:

1. **Command Error Handling**: 5 instances of `acceptableErrors` arrays with similar patterns
2. **Webview Creation/Disposal**: 10+ instances of panel creation and cleanup
3. **CreateAsyncTestResult**: Wrapper used in 45+ tests (ANTIPATTERN - broken timeout logic)
4. **Extension Activation**: Repeated extension checks
5. **Package.json Parsing**: Multiple tests reading package.json instead of using VS Code APIs

### Key Issues Identified:

1. **CreateAsyncTestResult Antipattern**:
    - Resolves immediately, timeout never triggers
    - Doesn't handle async functions properly
    - Forces `() => void` signature even for async functions
    - Should use native Mocha async/sync patterns instead

2. **Package.json Testing vs Runtime Testing**:
    - Current: Tests configuration in package.json
    - Better: Use VS Code APIs to test actual runtime behavior
    - Example: `vscode.commands.getCommands()` vs parsing package.json commands

### Existing Infrastructure:

- `src/constants/PowerQuerySdkExtension.ts` - has some constants but missing test-specific ones
- `src/commands/LifecycleCommands.ts` - has command constants but not exported for tests
- `src/test/common.ts` - has some test constants
- `src/test/TestUtils.ts` - has basic utilities

## Implementation Steps

### Step 1: Remove CreateAsyncTestResult Antipattern (PRIORITY)

**Critical**: Remove problematic wrapper from all 45+ test cases

- Remove `CreateAsyncTestResult()` function from `TestUtils.ts`
- Convert to native Mocha patterns:
    - Sync tests: `test("name", () => { ... })`
    - Async tests: `test("name", async () => { ... })`
- Add proper timeout handling using Mocha's built-in timeout where needed

### Step 2: Replace Package.json Testing with VS Code APIs

**Focus on runtime behavior over configuration**

- Replace package.json parsing with VS Code API calls:
    - Commands: Use `vscode.commands.getCommands()` instead of `packageJson.contributes.commands`
    - Views: Use `vscode.window.createTreeView()` to test registration
    - Webviews: Use `vscode.window.createWebviewPanel()` to verify support
- Create `PackageJsonHelper.ts` only for remaining config validation needs

### Step 3: Create Test-Specific Constants File

### Step 3: Create Test-Specific Constants File

**File**: `src/test/TestConstants.ts`

- Export all command name constants from `LifecycleCommands`
- Add view IDs, webview types, extension IDs
- Add commonly used error message patterns
- Add webview configuration constants

### Step 4: Create Command Testing Helper

**File**: `src/test/helpers/CommandTestHelper.ts`

- `executeCommandWithErrorHandling()` - standardized command execution with common error patterns
- `getStandardAcceptableErrors()` - return common error patterns by command type
- `assertCommandExecution()` - assertion helper for command execution results

### Step 5: Create Webview Testing Helper

**File**: `src/test/helpers/WebviewTestHelper.ts`

- `createTestWebviewPanel()` - standardized panel creation with cleanup
- `withWebviewPanel()` - higher-order function that handles creation/disposal automatically
- `createWebviewMessageTest()` - helper for message passing tests
- `createInteractiveWebviewTest()` - helper for interactive webview tests

### Step 6: Create Package.json Helper (Minimal)

**File**: `src/test/helpers/PackageJsonHelper.ts`

- Only for remaining configuration validation needs
- `getExtensionContributes()`, `getViewContributions()`, `getCommandContributions()`

### Step 7: Enhance TestUtils

### Step 7: Enhance TestUtils

**Update**: `src/test/TestUtils.ts`

- Remove `CreateAsyncTestResult()` function entirely
- `withCleanup()` - generic cleanup helper
- `assertExtensionLoaded()` - check extension activation
- `executeCommandSafely()` - safe command execution with timeout

### Step 8: Update All Test Files

### Step 8: Update All Test Files

- Remove all `CreateAsyncTestResult` wrappers (45+ instances)
- Replace hardcoded constants with imports from TestConstants
- Replace package.json parsing with VS Code API calls where possible
- Replace repeated patterns with helper functions
- Update imports to use new helpers

### Step 9: Validate Changes

- Run full test suite to ensure no regressions
- Verify all constants are correctly referenced
- Check that error handling still works as expected

## Files to Modify

### New Files:

- `src/test/TestConstants.ts`
- `src/test/helpers/CommandTestHelper.ts`
- `src/test/helpers/WebviewTestHelper.ts`
- `src/test/helpers/PackageJsonHelper.ts`

### Modified Files:

- `src/test/TestUtils.ts` (enhance existing)
- `src/test/suite/commands.test.ts` (use new helpers)
- `src/test/suite/webview.test.ts` (use new helpers)
- `src/test/suite/treeview.test.ts` (use constants)
- `src/test/suite/extension.test.ts` (use constants)
- `src/test/suite/project.integration.test.ts` (use constants)
- `src/test/suite/schema.test.ts` (use constants)

## Expected Benefits

1. **Reduced Duplication**: ~60% reduction in repeated code patterns
2. **Better Maintainability**: Constants managed in one place
3. **Improved Reliability**: VS Code API testing vs config testing
4. **Fixed Antipatterns**: Remove broken `CreateAsyncTestResult` wrapper
5. **Easier Testing**: Reusable helpers for common patterns
6. **Type Safety**: Better TypeScript support for test constants
7. **Native Mocha Support**: Use framework's async/sync patterns correctly

## Validation Criteria

- [ ] All `CreateAsyncTestResult` usages removed (45+ instances)
- [ ] All tests pass after refactoring with native Mocha patterns
- [ ] Package.json parsing replaced with VS Code APIs where possible
- [ ] No hardcoded command names in test files (except in constants)
- [ ] Webview tests use shared creation/disposal helpers
- [ ] Command tests use standardized error handling
- [ ] Constants are properly typed and exported
- [ ] Test code is more readable and maintainable

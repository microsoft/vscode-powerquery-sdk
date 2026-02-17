# ESLint Fixes Task Plan

## Summary

Fix 389 ESLint issues (361 errors, 28 warnings) across the codebase.

## Issue Categories

1. **sort-imports**: Import statements not sorted correctly
2. **@typescript-eslint/typedef**: Missing type annotations on variables
3. **@typescript-eslint/no-explicit-any**: Use of `any` type (warnings - can be addressed later)
4. **@typescript-eslint/no-unused-vars**: Unused variables
5. **require-await**: Async functions without await
6. **no-await-in-loop**: Await inside loops
7. **@typescript-eslint/no-floating-promises**: Promises not properly handled
8. **require-atomic-updates**: Race conditions
9. **max-len**: Lines too long
10. **@typescript-eslint/explicit-function-return-type**: Missing return types

## Execution Steps

### 1. SpawnedProcessStreaming.ts

- Fix import order (sort-imports)
- Add type annotations for variables
- Remove unused parameter or prefix with underscore
- Address async/await warning

### 2. PowerQuerySdkConfiguration.ts

- Add type annotations for `substituted` variables

### 3. extension.ts

- Fix import order
- Add type annotation for `testController`

### 4. PqTestExecutableOnceTask.ts

- Fix import order
- Add type annotation for `workingDir`
- Fix line length issue
- Handle `any` type

### 5. TestController.ts (largest file with most issues)

- Fix import order
- Add type annotations for all variables
- Handle floating promise
- Fix require-await warning
- Fix no-await-in-loop issues
- Fix require-atomic-updates race condition

### 6-10. Testing adapter files

- Fix import order in all files
- Add type annotations systematically
- Fix no-await-in-loop issues
- Handle unused variables
- Fix require-atomic-updates issues

### 11. Helper/Util files

- Fix remaining import order issues
- Add missing type annotations
- Fix unused variables

### 12. Validation

- Run ESLint to verify all fixes
- Run tests to ensure no breakage

## Notes

- Warnings about `any` types are lower priority and can be addressed separately
- Some `no-await-in-loop` may be acceptable if parallelization isn't safe
- Race condition warnings may need careful review

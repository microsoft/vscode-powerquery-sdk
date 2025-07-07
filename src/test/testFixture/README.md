# Test Fixture Directory

This directory contains test files and fixtures used by the VS Code PowerQuery SDK extension tests.

## Files

-   `sample.testsettings.json` - A sample test settings file that conforms to the UserSettings.schema.json schema. Used for testing JSON schema validation and VS Code language service integration.

## Purpose

This directory serves as a controlled test environment for UI and integration tests that need to work with actual files. By using a dedicated test fixture directory instead of relying on the workspace folder, we ensure:

1. Tests are consistent and reproducible
2. Test files are version controlled
3. Tests don't depend on the user's workspace state
4. Sample files are available for testing schema validation

## Adding New Test Files

When adding new test files to this directory:

1. Ensure they follow the appropriate schema or format
2. Add documentation in this README
3. Update relevant test cases to use the new files
4. Consider both valid and invalid examples for comprehensive testing

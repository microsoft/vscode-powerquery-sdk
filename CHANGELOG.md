# Change Log

All notable changes to the "vscode-powerquery-sdk" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Added
- Comprehensive test migration from vscode-extension-tester to @vscode/test-electron
- Advanced testing patterns including property-based, edge case, and performance testing
- Service abstraction interfaces (IFileSystem, IUIService, II18nService) for improved testability
- 152 unit tests with zero external dependencies
- 13 integration tests for VS Code API functionality
- Comprehensive testing documentation (TESTING.md)
- Command handler refactoring with 4 fully tested handlers
- Validation utilities with extensive test coverage
- Developer guide sections in README.md

### Changed
- Migrated from vscode-extension-tester to @vscode/test-electron framework
- Extracted business logic into testable services and command handlers
- Improved code organization with clear separation of concerns
- Enhanced test reliability and maintainability

### Removed
- All vscode-extension-tester dependencies and configuration
- Legacy test files and utilities
- Unused disabled test files

### Technical Improvements
- ESLint compliance across all test files
- Property-based testing for validation logic
- Performance benchmarks with automated thresholds
- Concurrent validation testing for thread safety
- Edge case testing for boundary conditions and unicode support

- Initial release

# Power Query Connector SDK for Visual Studio Code

> **_NOTE:_** The Power Query SDK extension for Visual Studio Code is currently in Public Preview. You can learn more about this extension and the development of Power Query data connectors from the link [aka.ms/PowerQuerySDKDocs](https://aka.ms/PowerQuerySDKDocs).

Provides functionality related to the development and testing of Custom Connectors for Power Query and Power BI.

Install the latest version of the [Power Query SDK through the Visual Studio Code Marketplace](https://aka.ms/PowerQuerySDK).

![Animated demonstration GIF of the Power Query SDK for Visual Studio Code](media/VSCodeSDK.gif)

> **_NOTE:_** You can learn how to manually build and install this project from the article on [build and install](build.md).

## Features

What you can do with this extension:

- Create a new extension project using a custom connector template
- Build connector file (.mez)
- Set and manage credentials
- Run test queries
- Test your TestConnection function for refresh on the cloud
- View query results
- Leverage syntax highlighting and intellisense for writing M script
- Manage your workspace settings and other project-level configurations

## Developer Guide

### CLI execution and the retired service host

Starting with version 0.8.0, the SDK uses `PQTest.exe` for all operations, regardless
of the SdkTools version. The experimental `PQServiceHost` backend has been removed.
`powerquery.sdk.features.useServiceHost` remains registered as deprecated but is
ignored, even when set to `true`. You can remove it from your settings. Changing
this setting does not display a notification or require a reload.

The extension continues to use the existing tool-version selection and configured
tool locations. SdkTools 2.160.2, the latest public release at the time of this
change, is supported; a newer package is not required. Packages released after
2.160.2 will not include the service host, and the extension does not require it.

Query execution is file-based. When running a dirty query through the SDK's query
command, query task, or run/debug integration, choose **Save and Run** to save the
target document first. Cancelling or a failed save prevents execution. Untitled
queries must be saved to a local file before running. Independently invoked shell
commands run the files on disk; save any editor changes yourself first.

Operations no longer reuse a warm service process and may take longer. Existing
credential storage is unchanged, and this update does not remove cached tool
packages or stop old service-host processes. After updating, reload all SDK
windows and close older clients. Older extensions with the service-host setting
enabled must be updated, or that setting disabled, before using a host-free
SdkTools package.

### Testing Architecture

This extension uses a modern, comprehensive testing approach designed for reliability and maintainability:

#### Test Types

- **Unit Tests** (152 tests): Pure business logic testing with no external dependencies
    - Property-based testing for validation logic
    - Performance testing with automated thresholds
    - Edge case and boundary condition testing
    - Service logic testing with dependency injection

- **Integration Tests** (13 tests): VS Code API integration testing
    - Extension loading and command registration
    - Schema management and validation
    - File system operations in VS Code context

#### Running Tests

```bash
# Run all tests (unit + integration)
npm test

# Run only unit tests (fast, no VS Code dependencies)
npm run test:unit-test

# Run only integration tests (requires VS Code)
npm run test:e2e
```

#### Test Development Patterns

The project follows these testing patterns:

1. **Pure Business Logic**: Extract validation and data processing into testable functions
2. **Service Abstraction**: Use dependency injection with interface abstractions
3. **Property-Based Testing**: Generate random test data to verify business rules
4. **Performance Baselines**: Automated performance testing with realistic thresholds

#### Adding New Tests

- Place unit tests in `unit-tests/` directory
- Use property-based testing for validation logic
- Include edge case and performance tests for critical paths
- Follow existing patterns in `unit-tests/validation/` and `unit-tests/commands/handlers/`

### Build and Development

```bash
# Install dependencies
npm install

# Development build (watch mode)
npm run watch

# Production build
npm run compile

# Lint code
npm run lint

# Package extension
npm run package
```

## Related projects

[vscode-powerquery](https://github.com/microsoft/vscode-powerquery)

## Contributing

This project welcomes contributions and suggestions. Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit <https://cla.opensource.microsoft.com>.

When you submit a pull request, a CLA bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., status check, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## Trademarks

This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft
trademarks or logos is subject to and must follow
[Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
Any use of third-party trademarks or logos are subject to those third-party's policies.

## Support and issues

Before creating a new issue or discussion, please make sure to the read our [support](SUPPORT.md) article for guidelines.

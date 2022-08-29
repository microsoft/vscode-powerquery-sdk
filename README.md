# Power Query Connector SDK for VS Code

Provides functionality related to the development and testing of [Custom Connectors for Power Query and Power BI](https://docs.microsoft.com/en-us/power-query/startingtodevelopcustomconnectors).

## Features

-   Custom connector template
-   Build connector file (.mez)
-   Set credentials
-   Run test queries
-   View query results

## Requirements

### nuget.exe

The extension uses [nuget.exe](https://www.nuget.org/downloads) to automatically provision the Microsoft.PowerQuery.SdkTools package on startup.

## How to build and install from source

1. To build the installer (.vsix), you need to install [vsce](https://www.npmjs.com/package/vsce).

```msdos
npm install -g vsce
```

1. Install project dependencies

```msdos
cd vscode-powerquery-sdk
npm install
```

1. Create the install package to build the project

```msdos
vsce package
```

1. Install the extension from the command line

```msdos
code --install-extension vscode-powerquery-sdk-*.vsix
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

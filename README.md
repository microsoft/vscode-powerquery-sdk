# Power Query Connector SDK for VS Code

Provides functionality related to the development and testing of [Custom Connectors for Power Query and Power BI](https://docs.microsoft.com/en-us/power-query/startingtodevelopcustomconnectors).

## Features

-   Custom connector template
-   Build connector file (.mez)
-   Set credentials
-   Run test queries
-   View query results

## How to build and install from source

Install project dependencies:

```msdos
npm install
```

Build the project and create the vsix installer (`npx vsce package`):

```msdos
npm run vsix
```

Install the extension from the command line (`code --install-extension <pqsdk.vsix>`):

```msdos
npm run code-install
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

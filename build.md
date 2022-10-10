# Build and install from source

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
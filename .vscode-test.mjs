import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
    files: "out/src/test/suite/**/*.test.js",
    workspaceFolder: "./out/test/testFixture",
    extensionDevelopmentPath: "./",
    installExtensions: ["PowerQuery.vscode-powerquery"],
    useInstallation: {
        fromMachine: false, // Don't use extensions from the machine - creates clean environment
    },
    launchArgs: [
        // Enable only the specific extensions we need for testing
        "--enable-proposed-api=PowerQuery.vscode-powerquery-sdk",
        "--enable-proposed-api=PowerQuery.vscode-powerquery",
        // Disable some common extensions that might interfere with tests
        "--disable-extension=ms-python.python",
        "--disable-extension=ms-python.vscode-pylance",
        "--disable-extension=ms-vsliveshare.vsliveshare",
        "--disable-extension=github.copilot",
        "--disable-extension=github.copilot-chat",
    ],
    env: {
        NODE_ENV: "test",
    },
    mocha: {
        timeout: 20000,
        retries: 1,
    },
});

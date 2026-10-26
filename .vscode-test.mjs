import { defineConfig } from "@vscode/test-cli";
import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const external = process.env.PQSDK_TEST_EXTERNAL === "1";
const nugetPath = process.env.PQSDK_TEST_NUGET_PATH;
const nugetFeed = process.env.PQSDK_TEST_NUGET_FEED;
const root = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
require("ts-node").register({ transpileOnly: true, project: path.join(root, "tsconfig.json") });
const { resolveLocalSdkTools } = require("./src/utils/localSdkTools");
let workspaceFolder = "./out/test/testFixture";

if (
    external &&
    (process.env.PQSDK_TEST_TOOLS_PATH !== undefined || process.env.PQSDK_TEST_TOOLS_AUTODISCOVER === "1")
) {
    throw new Error(
        "Unset PQSDK_TEST_TOOLS_PATH and PQSDK_TEST_TOOLS_AUTODISCOVER when running real feed acquisition tests.",
    );
}

const toolsPath = resolveLocalSdkTools();

if ((nugetPath !== undefined || nugetFeed !== undefined || external) && (!nugetPath || !nugetFeed)) {
    throw new Error("Set both PQSDK_TEST_NUGET_PATH and PQSDK_TEST_NUGET_FEED to test an approved package feed.");
}

if (nugetPath && nugetFeed) {
    if (
        !path.isAbsolute(nugetPath) ||
        !fs.statSync(path.join(nugetPath, "nuget.exe"), { throwIfNoEntry: false })?.isFile()
    ) {
        throw new Error("PQSDK_TEST_NUGET_PATH must be an absolute path to a folder containing nuget.exe.");
    }

    const testDirectory = path.join(root, ".vscode-test");
    fs.mkdirSync(testDirectory, { recursive: true });
    workspaceFolder = path.join(testDirectory, "sdk-feed.code-workspace");
    fs.writeFileSync(
        workspaceFolder,
        JSON.stringify({
            folders: [{ path: path.join(root, "out", "test", "testFixture") }],
            settings: {
                "powerquery.sdk.externals.nugetPath": nugetPath,
                "powerquery.sdk.externals.nugetFeed": nugetFeed,
            },
        }),
    );
}

export default defineConfig({
    files: "out/src/test/suite/**/*.test.js",
    workspaceFolder,
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
        PQSDK_TEST_TOOLS_PATH: toolsPath,
        PQSDK_TEST_TOOLS_AUTODISCOVER: process.env.PQSDK_TEST_TOOLS_AUTODISCOVER,
        PQSDK_TEST_EXTERNAL: process.env.PQSDK_TEST_EXTERNAL,
    },
    mocha: {
        timeout: 20000,
        retries: 1,
    },
});

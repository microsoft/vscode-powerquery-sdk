import { defineConfig } from "@vscode/test-cli";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const external = process.env.PQSDK_TEST_EXTERNAL === "1";
const nugetPath = process.env.PQSDK_TEST_NUGET_PATH;
const nugetFeed = process.env.PQSDK_TEST_NUGET_FEED;
const root = path.dirname(fileURLToPath(import.meta.url));
let workspaceFolder = "./out/test/testFixture";

if (process.env.PQSDK_TEST_TOOLS_PATH !== undefined) {
    const tools = process.env.PQSDK_TEST_TOOLS_PATH;

    if (
        !tools.trim() ||
        !path.isAbsolute(tools) ||
        !["PQTest.exe", "MakePQX.exe"].every(executable =>
            fs.statSync(path.join(tools, executable), { throwIfNoEntry: false })?.isFile(),
        )
    ) {
        throw new Error(
            "PQSDK_TEST_TOOLS_PATH must be an absolute tools directory containing PQTest.exe and MakePQX.exe.",
        );
    }
}

if (external && process.env.PQSDK_TEST_TOOLS_PATH !== undefined) {
    throw new Error("Unset PQSDK_TEST_TOOLS_PATH when running real feed acquisition tests.");
}

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
        PQSDK_TEST_TOOLS_PATH: process.env.PQSDK_TEST_TOOLS_PATH,
        PQSDK_TEST_EXTERNAL: process.env.PQSDK_TEST_EXTERNAL,
    },
    mocha: {
        ...(external ? {} : { grep: "\\[External\\]", invert: true }),
        timeout: 20000,
        retries: 1,
    },
});

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { defineConfig } from "@vscode/test-cli";
import * as fs from "node:fs";
import * as path from "node:path";

import { resolveLocalSdkTools } from "./src/utils/localSdkTools";

const external: boolean = process.env.PQSDK_TEST_EXTERNAL === "1";
const nugetPath: string | undefined = process.env.PQSDK_TEST_NUGET_PATH;
const nugetFeed: string | undefined = process.env.PQSDK_TEST_NUGET_FEED;
const root: string = __dirname;
let workspaceFolder: string = "./out/test/testFixture";

if (
    external &&
    (process.env.PQSDK_TEST_TOOLS_PATH !== undefined || process.env.PQSDK_TEST_TOOLS_AUTODISCOVER === "1")
) {
    throw new Error(
        "Unset PQSDK_TEST_TOOLS_PATH and PQSDK_TEST_TOOLS_AUTODISCOVER when running real feed acquisition tests.",
    );
}

const toolsPath: string | undefined = resolveLocalSdkTools();

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

    const testDirectory: string = path.join(root, ".vscode-test");
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
        fromMachine: false,
    },
    launchArgs: [
        "--enable-proposed-api=PowerQuery.vscode-powerquery-sdk",
        "--enable-proposed-api=PowerQuery.vscode-powerquery",
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

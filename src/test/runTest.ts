/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as cp from "child_process";
import * as path from "path";
import { downloadAndUnzipVSCode, resolveCliPathFromVSCodeExecutablePath, runTests } from "@vscode/test-electron";

async function main(): Promise<void> {
    try {
        // The folder containing the Extension Manifest package.json
        // Passed to `--extensionDevelopmentPath`
        const extensionDevelopmentPath = path.resolve(__dirname, "../../");

        // The path to test runner
        // Passed to --extensionTestsPath
        const extensionTestsPath = path.resolve(__dirname, "./suite/index");
        // Let's test again the latest insider and isolate current working stable ones
        // if we want we can run multiple batches against multiple versions vsc either stable or insiders
        const vscodeExecutablePath = await downloadAndUnzipVSCode("insiders");
        const cliPath = resolveCliPathFromVSCodeExecutablePath(vscodeExecutablePath);

        // Use cp.spawn / cp.exec for custom setup
        cp.spawnSync(cliPath, ["--install-extension", "powerquery.vscode-powerquery"], {
            encoding: "utf-8",
            stdio: "inherit",
        });

        // Download VS Code, unzip it and run the integration test
        await runTests({ vscodeExecutablePath, extensionDevelopmentPath, extensionTestsPath });
    } catch (err) {
        console.error("Failed to run tests");
        process.exit(1);
    }
}

main();

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as cp from "child_process";
import * as path from "path";
import { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath, runTests } from "@vscode/test-electron";

async function main(): Promise<void> {
    try {
        const extensionDevelopmentPath = path.resolve(__dirname, "../../../");
        const extensionTestsPath = path.resolve(__dirname, "./suite/index");
        const vscodeExecutablePath = await downloadAndUnzipVSCode("stable");
        const [cliPath, ...args] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);

        // Install powerquery language service package dependency.
        cp.spawnSync(cliPath, [...args, "--install-extension", "powerquery.vscode-powerquery"], {
            encoding: "utf-8",
            stdio: "inherit",
        });

        // Run the extension test
        await runTests({
            vscodeExecutablePath,
            extensionDevelopmentPath,
            extensionTestsPath,
        });
    } catch (err) {
        console.error("Failed to run tests");
        process.exit(1);
    }
}

main();

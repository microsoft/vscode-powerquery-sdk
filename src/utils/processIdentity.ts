/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { spawnSync, SpawnSyncReturns } from "child_process";

let currentProcessCreationTime: string | undefined;

export function getProcessCreationTime(pid: number): string | undefined {
    if (!Number.isSafeInteger(pid) || pid < 1 || pid > 2147483647) {
        throw new Error(`Invalid Windows process ID: ${pid}`);
    }

    // Other PIDs can be reused; only this process's identity is safe to cache.
    if (pid === process.pid && currentProcessCreationTime) {
        return currentProcessCreationTime;
    }

    const script: string = [
        "try {",
        `$process = [System.Diagnostics.Process]::GetProcessById(${pid});`,
        "try {",
        "[Console]::Write($process.StartTime.ToUniversalTime().Ticks.ToString([System.Globalization.CultureInfo]::InvariantCulture))",
        "} finally { $process.Dispose() }",
        "} catch {",
        "$exception = $_.Exception;",
        "while ($exception.InnerException) { $exception = $exception.InnerException };",
        "if ($exception -is [System.ArgumentException]) { exit 3 };",
        "[Console]::Error.Write($_.Exception.Message); exit 1",
        "}",
    ].join(" ");

    const result: SpawnSyncReturns<string> = spawnSync(
        "powershell.exe",
        ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
        { encoding: "utf8", windowsHide: true, timeout: 10000 },
    );

    if (result.error) {
        throw result.error;
    }

    if (result.status === 3) {
        return undefined;
    }

    if (result.status !== 0 || !/^[1-9]\d*$/.test(result.stdout.trim())) {
        throw new Error(`Cannot verify Windows process identity for PID ${pid}: ${result.stderr || result.stdout}`);
    }

    const creationTime: string = result.stdout.trim();

    if (pid === process.pid) {
        currentProcessCreationTime = creationTime;
    }

    return creationTime;
}

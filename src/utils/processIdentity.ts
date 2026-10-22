/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { execFile, ExecFileException } from "child_process";

let currentProcessCreationTime: Promise<string | undefined> | undefined;

export function getProcessCreationTime(pid: number): Promise<string | undefined> {
    if (!Number.isSafeInteger(pid) || pid < 1 || pid > 2147483647) {
        return Promise.reject(new Error(`Invalid Windows process ID: ${pid}`));
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

    const query: Promise<string | undefined> = new Promise(
        (resolve: (value: string | undefined) => void, reject: (reason: unknown) => void) => {
            execFile(
                "powershell.exe",
                ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
                { encoding: "utf8", windowsHide: true, timeout: 10000 },
                (error: ExecFileException | null, stdout: string, stderr: string): void => {
                    if (error) {
                        if (error.code === 3 && !error.killed && !error.signal) {
                            resolve(undefined);
                        } else {
                            reject(error);
                        }

                        return;
                    }

                    if (!/^[1-9]\d*$/.test(stdout.trim())) {
                        reject(new Error(`Cannot verify Windows process identity for PID ${pid}: ${stderr || stdout}`));

                        return;
                    }

                    resolve(stdout.trim());
                },
            );
        },
    );

    if (pid === process.pid) {
        currentProcessCreationTime = query;

        void query.catch(() => {
            currentProcessCreationTime = undefined;
        });
    }

    return query;
}

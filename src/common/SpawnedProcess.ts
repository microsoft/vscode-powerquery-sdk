/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as cp from "child_process";
import { ChildProcess, SpawnOptionsWithoutStdio } from "child_process";

export interface ProcessExit {
    stdout: string;
    stderr: string;
    exitCode: number | null;
    signal: NodeJS.Signals | null;
}

export interface AdditionalOption {
    stdinStr?: string;
    onSpawned?: (childProcess: ChildProcess) => void;
    onStdOut?: (data: Buffer) => void;
    onStdErr?: (data: Buffer) => void;
    onExit?: (code: number | null, signal: NodeJS.Signals | null, stdErr: string, stdOut: string) => void;
}

const DEFAULT_TIMEOUT: number = 3e5; // 5mins

export class SpawnedProcess {
    private readonly _promise: Promise<ProcessExit>;
    private _cpStream: ChildProcess | undefined;
    private _stdout: string = "";
    private _stderr: string = "";
    private _exitCode: number | null = null;
    private _signal: NodeJS.Signals | null = null;

    get deferred$(): Promise<ProcessExit> {
        return this._promise;
    }

    get cpStream(): ChildProcess | undefined {
        return this._cpStream;
    }

    get stdOut(): string {
        return this._stdout;
    }

    get pid(): number | undefined {
        return this._cpStream?.pid;
    }

    get stdErr(): string {
        return this._stderr;
    }

    constructor(
        public readonly command: string,
        args?: ReadonlyArray<string>,
        options?: SpawnOptionsWithoutStdio,
        additionalOption?: AdditionalOption,
    ) {
        this._promise = new Promise<ProcessExit>(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (res: (value: PromiseLike<ProcessExit> | ProcessExit) => void, rej: (reason: any) => void) => {
                const theCpStream: ChildProcess = cp.spawn(command, args ?? [], {
                    timeout: DEFAULT_TIMEOUT,
                    ...options,
                    stdio: [typeof additionalOption?.stdinStr === "string" ? "pipe" : "ignore", "pipe", "pipe"],
                });

                additionalOption?.onSpawned && additionalOption?.onSpawned(theCpStream);

                if (typeof additionalOption?.stdinStr === "string") {
                    theCpStream.stdin?.write(additionalOption.stdinStr);
                    theCpStream.stdin?.destroy();
                }

                theCpStream.stdout?.on("data", (data: Buffer) => {
                    additionalOption?.onStdOut && additionalOption?.onStdOut(data);
                    this._stdout = this._stdout.concat(data.toString("utf8"));
                });

                theCpStream.stderr?.on("data", (data: Buffer) => {
                    additionalOption?.onStdErr && additionalOption?.onStdErr(data);
                    this._stderr = this._stderr.concat(data.toString("utf8"));
                });

                theCpStream.on("error", (error: Error) => {
                    additionalOption?.onStdErr && additionalOption?.onStdErr(Buffer.from(error.toString(), "utf-8"));
                    this._stderr = this._stderr.concat(error.toString());
                    rej(error);
                });

                theCpStream.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
                    this._exitCode = code;
                    this._signal = signal;
                    additionalOption?.onExit && additionalOption?.onExit(code, signal, this._stderr, this._stdout);

                    res({
                        stdout: this._stdout,
                        stderr: this._stderr,
                        exitCode: this._exitCode,
                        signal: this._signal,
                    });
                });

                this._cpStream = theCpStream;
            },
        );
    }
}

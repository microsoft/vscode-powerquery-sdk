/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as cp from "child_process";
import { SpawnOptionsWithoutStdio, ChildProcessWithoutNullStreams } from "child_process";

export interface ProcessExit {
    stdout: string;
    stderr: string;
    exitCode: number | null;
    signal: NodeJS.Signals | null;
}

export interface AdditionalOption {
    stdinStr?: string;
    onSpawned?: (childProcess: ChildProcessWithoutNullStreams) => void;
    onStdOut?: (data: Buffer) => void;
    onStdErr?: (data: Buffer) => void;
    onExit?: (code: number | null, signal: NodeJS.Signals | null, stdErr: string, stdOut: string) => void;
}

const DEFAULT_TIMEOUT: number = 3e5; // 5mins

export class SpawnedProcess {
    private readonly _promise: Promise<ProcessExit>;
    private _cpStream: ChildProcessWithoutNullStreams | undefined;
    private _stdout = "";
    private _stderr = "";
    private _exitCode: number | null = null;
    private _signal: NodeJS.Signals | null = null;

    get deferred$() {
        return this._promise;
    }

    // get CpStream(){
    //   return this._cpStream;
    // }

    get stdOut() {
        return this._stdout;
    }

    get pid() {
        return this._cpStream?.pid;
    }

    get stdErr() {
        return this._stderr;
    }

    constructor(
        public readonly command: string,
        args?: ReadonlyArray<string>,
        options?: SpawnOptionsWithoutStdio,
        additionalOption?: AdditionalOption,
    ) {
        this._promise = new Promise<ProcessExit>(res => {
            this._cpStream = cp.spawn(command, args, { timeout: DEFAULT_TIMEOUT, ...options });
            additionalOption?.onSpawned && additionalOption?.onSpawned(this._cpStream);
            if (additionalOption?.stdinStr) {
                this._cpStream.stdin.write(additionalOption.stdinStr);
                this._cpStream.stdin.destroy();
            }
            this._cpStream.stdout.on("data", (data: Buffer) => {
                additionalOption?.onStdOut && additionalOption?.onStdOut(data);
                this._stdout = this._stdout.concat(data.toString("utf8"));
            });
            this._cpStream.stderr.on("data", (data: Buffer) => {
                additionalOption?.onStdErr && additionalOption?.onStdErr(data);
                this._stderr = this._stderr.concat(data.toString("utf8"));
            });
            this._cpStream.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
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
        });
    }
}

export default SpawnedProcess;

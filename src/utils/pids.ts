/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as net from "net";
import * as process from "process";

/**
 * Will throw an error if target does not exist, and as a special case, a signal
 * of 0 can be used to test for the existence of a process
 * @param pid: number
 */
export function pidIsRunning(pid: number): boolean {
    try {
        process.kill(pid, 0);

        return true;
    } catch (e) {
        return false;
    }
}

export function delay(ms: number): Promise<void> {
    return new Promise((resolve: (value: void | PromiseLike<void>) => void) => setTimeout(resolve, ms));
}

export function isPortBusy(port: number): Promise<boolean> {
    return new Promise((resolve: (value: boolean | PromiseLike<boolean>) => void) => {
        const theServer: net.Server = net.createServer((socket: net.Socket) => {
            // write a space char to activate the socket, do not remove it
            socket.write(" ");
            socket.pipe(socket);
        });

        theServer.on("error", (_err: Error) => {
            resolve(true);
        });

        theServer.on("listening", () => {
            theServer.close();
            resolve(false);
        });

        theServer.listen(port, "127.0.0.1");
    });
}

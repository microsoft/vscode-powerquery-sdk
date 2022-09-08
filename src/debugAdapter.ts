/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as Net from "net";
import { Socket } from "net";

import { MQueryDebugSession } from "./debugAdaptor/MQueryDebugSession";

/*
 * debugAdapter.js is the entrypoint of the debug adapter when it runs as a separate process.
 */

/*
 * When the debug adapter is run as an external process,
 * normally the helper function DebugSession.run(...) takes care of everything:
 *
 * 	MockDebugSession.run(MockDebugSession);
 *
 * but here the helper is not flexible enough to deal with a debug session constructors with a parameter.
 * So for now we copied and modified the helper:
 */

// first parse command line arguments to see whether the debug adapter should run as a server
let port: number = 0;
const args: string[] = process.argv.slice(2);

args.forEach(function (val: string, _index: number, _array: string[]) {
    const portMatch: RegExpMatchArray | null = /^--server=(\d{4,5})$/.exec(val);

    if (portMatch) {
        port = parseInt(portMatch[1], 10);
    }
});

if (port > 0) {
    // start a server that creates a new session for every connection request
    console.error(`waiting for debug protocol on port ${port}`);

    Net.createServer((socket: Socket) => {
        console.error(">> accepted connection from client");

        socket.on("end", () => {
            console.error(">> client connection closed\n");
        });

        const session: MQueryDebugSession = new MQueryDebugSession();
        session.setRunAsServer(true);
        session.start(socket, socket);
    }).listen(port);
} else {
    // start a single session that communicates via stdin/stdout
    const session: MQueryDebugSession = new MQueryDebugSession();

    process.on("SIGTERM", () => {
        session.shutdown();
    });

    session.start(process.stdin, process.stdout);
}

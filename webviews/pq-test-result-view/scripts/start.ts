/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as fs from "fs";
import * as http from "http";
import * as path from "path";
import webpack, { Configuration, Stats } from "webpack";

import paths from "../config/paths";
import config from "../config/webpack.dev";

const contentTypes: Record<string, string> = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
};

function sendFile(response: http.ServerResponse, filePath: string, method: string | undefined): void {
    response.writeHead(200, {
        "Content-Type": contentTypes[path.extname(filePath)] ?? "application/octet-stream",
    });

    if (method === "HEAD") {
        response.end();
        return;
    }

    fs.createReadStream(filePath).pipe(response);
}

const server: http.Server = http.createServer((request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { Allow: "GET, HEAD" });
        response.end();
        return;
    }

    let relativePath: string;

    try {
        const requestUrl: URL = new URL(request.url || "/", "http://localhost:3001");
        relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "") || "index.html";
    } catch {
        response.writeHead(400);
        response.end();
        return;
    }

    const requestedPath: string = path.resolve(paths.appBuild, relativePath);
    const buildRoot: string = `${path.resolve(paths.appBuild)}${path.sep}`;

    if (!requestedPath.startsWith(buildRoot)) {
        response.writeHead(403);
        response.end();
        return;
    }

    fs.stat(requestedPath, (error, stats) => {
        if (!error && stats.isFile()) {
            sendFile(response, requestedPath, request.method);
            return;
        }

        const indexPath: string = path.join(paths.appBuild, "index.html");

        fs.stat(indexPath, indexError => {
            if (indexError) {
                response.writeHead(404);
                response.end();
                return;
            }

            sendFile(response, indexPath, request.method);
        });
    });
});

const compiler = webpack(config as Configuration);
const watcher = compiler.watch({}, (error: Error | null | undefined, stats: Stats | undefined) => {
    if (error) {
        console.error(error);
        return;
    }

    if (!stats) {
        console.error("Webpack did not return build statistics.");
        return;
    }

    console.log(
        stats.toString({
            colors: true,
            all: false,
            errors: true,
            warnings: true,
            timings: true,
        }),
    );

    if (!stats.hasErrors()) {
        console.log(`compiled successfully in ${stats.endTime! - stats.startTime!} ms`);
    }
});

if (!watcher) {
    throw new Error("Webpack did not start watching the webview.");
}

const activeWatcher = watcher;

server.listen(3001, "localhost", () => {
    console.log("PQTest result webview available at http://localhost:3001");
});

function shutdown(): void {
    server.close(() => {
        activeWatcher.close(() => process.exit(0));
    });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

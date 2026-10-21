/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const webpack = require("webpack");

const config = require("../config/webpack.dev");
const paths = require("../config/paths");

const contentTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
};

const sendFile = (response, filePath, method) => {
    response.writeHead(200, {
        "Content-Type": contentTypes[path.extname(filePath)] ?? "application/octet-stream",
    });

    if (method === "HEAD") {
        response.end();
        return;
    }

    fs.createReadStream(filePath).pipe(response);
};

const server = http.createServer((request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { Allow: "GET, HEAD" });
        response.end();
        return;
    }

    const requestUrl = new URL(request.url, "http://localhost:3001");
    const relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "") || "index.html";
    const requestedPath = path.resolve(paths.appBuild, relativePath);
    const buildRoot = `${path.resolve(paths.appBuild)}${path.sep}`;

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

        const indexPath = path.join(paths.appBuild, "index.html");

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

const compiler = webpack(config);
const watcher = compiler.watch({}, (error, stats) => {
    if (error) {
        console.error(error);
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
});

server.listen(3001, "localhost", () => {
    console.log("PQTest result webview available at http://localhost:3001");
});

const shutdown = () => {
    server.close(() => {
        watcher.close(() => process.exit(0));
    });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

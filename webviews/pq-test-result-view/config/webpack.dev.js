/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

"use strict";

// Do this as the first thing so that any code reading it knows the right env.
process.env.BABEL_ENV = "development";
process.env.NODE_ENV = "development";

const { merge } = require("webpack-merge");

const commonConfig = require("./webpack.common");
// const packageJson = require("../package.json");

const devConfig = {
    mode: "development",
    devtool: "eval-source-map",
    output: {
        publicPath: "http://localhost:3001/",
    },
    devServer: {
        port: 3001,
        // client: {
        //     webSocketURL: {
        //         hostname: "127.0.0.1",
        //         pathname: "/ws",
        //         // password: 'dev-server',
        //         port: 3001,
        //         protocol: "ws",
        //         // username: 'webpack',
        //     },
        // },
        client: false,
        webSocketServer: false,
        historyApiFallback: {
            index: "index.html",
        },
    },
    plugins: [],
};

module.exports = merge(commonConfig, devConfig);

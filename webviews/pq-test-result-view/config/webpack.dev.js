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
const paths = require("./paths");

const devConfig = {
    mode: "development",
    devtool: "eval-source-map",
    output: {
        path: paths.appBuild,
        filename: "[name].js",
        publicPath: "http://localhost:3001/",
    },
    plugins: [],
};

module.exports = merge(commonConfig, devConfig);

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

"use strict";

const path = require("path");
// Do this as the first thing so that any code reading it knows the right env.
process.env.BABEL_ENV = "production";
process.env.NODE_ENV = "production";

const { merge } = require("webpack-merge");
const CopyPlugin = require("copy-webpack-plugin");
const paths = require("./paths");

const commonConfig = require("./webpack.common");
// const packageJson = require("../package.json");

const prodConfig = {
    mode: "production",
    output: {
        path: paths.appBuild,
        // filename: "[name].[contenthash:8].js",
        // since we host it from the
        filename: "[name].js",
    },
    plugins: [
        new CopyPlugin({
            patterns: [{ from: path.resolve(paths.appPublic, "i18n"), to: path.resolve(paths.appBuild, "i18n") }],
        }),
    ],
};

module.exports = merge(commonConfig, prodConfig);

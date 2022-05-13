"use strict";

// Do this as the first thing so that any code reading it knows the right env.
process.env.BABEL_ENV = "production";
process.env.NODE_ENV = "production";

const { merge } = require("webpack-merge");
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
    plugins: [],
};

module.exports = merge(commonConfig, prodConfig);

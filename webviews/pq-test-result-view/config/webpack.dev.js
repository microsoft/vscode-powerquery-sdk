"use strict";

// Do this as the first thing so that any code reading it knows the right env.
process.env.BABEL_ENV = "development";
process.env.NODE_ENV = "development";

const { merge } = require("webpack-merge");

const commonConfig = require("./webpack.common");
// const packageJson = require("../package.json");

const devConfig = {
    mode: "development",
    devtool: "cheap-module-source-map",
    output: {
        publicPath: "http://localhost:3001/",
    },
    devServer: {
        port: 3001,
        historyApiFallback: {
            index: "index.html",
        },
    },
    plugins: [],
};

module.exports = merge(commonConfig, devConfig);

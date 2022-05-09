//@ts-check

"use strict";

const prodConfig = require("./webpack.config");
const { merge } = require("webpack-merge");

const devConfig = {
    mode: "development",
    devtool: "eval-source-map",
};
module.exports = merge(prodConfig, devConfig);

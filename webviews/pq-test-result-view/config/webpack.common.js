/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const ESLintPlugin = require("eslint-webpack-plugin");
const ForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin");
const paths = require("./paths");
const getClientEnvironment = require("./env");
const env = getClientEnvironment();

module.exports = {
    entry: "./src/index.ts",
    resolve: {
        extensions: paths.moduleFileExtensions,
        alias: {
            vscode: false,
            "react/jsx-dev-runtime": "react/jsx-dev-runtime.js",
            "react/jsx-runtime": "react/jsx-runtime.js",
        },
    },
    performance: {
        maxAssetSize: 512000,
    },
    module: {
        rules: [
            {
                test: /\.(png|jpe?g|gif|woff|svg|eot|ttf)$/i,
                use: [{ loader: "file-loader" }],
            },
            {
                test: /\.css$/,
                use: ["style-loader", "css-loader"],
            },
            {
                test: /\.tsx?$/,
                exclude: /node_modules/,
                use: {
                    loader: "babel-loader",
                    options: {
                        presets: ["@babel/preset-env", "@babel/preset-react", "@babel/preset-typescript"],
                        plugins: ["@babel/plugin-transform-runtime", "@babel/plugin-transform-class-properties"],
                    },
                },
            },
        ],
    },
    plugins: [
        new webpack.DefinePlugin(env.stringified),
        new HtmlWebpackPlugin({
            template: "./public/index.html",
        }),
        new ForkTsCheckerWebpackPlugin(),
    ],
};

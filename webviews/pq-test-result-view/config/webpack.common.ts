/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import ForkTsCheckerWebpackPlugin from "fork-ts-checker-webpack-plugin";
import HtmlWebpackPlugin from "html-webpack-plugin";
import * as webpack from "webpack";
import type { Configuration } from "webpack";

import getClientEnvironment from "./env";
import paths, { moduleFileExtensions } from "./paths";

const environment = getClientEnvironment();

const config: Configuration = {
    entry: paths.appIndexJs,
    resolve: {
        extensions: moduleFileExtensions,
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
        new webpack.DefinePlugin(environment.stringified),
        new HtmlWebpackPlugin({
            template: paths.appHtml,
        }),
        new ForkTsCheckerWebpackPlugin(),
    ],
};

export default config;

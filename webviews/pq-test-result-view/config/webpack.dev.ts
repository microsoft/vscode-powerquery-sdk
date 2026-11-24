/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as path from "path";
import CopyPlugin from "copy-webpack-plugin";
import type { Configuration } from "webpack";
import { merge } from "webpack-merge";

import "./environment.development";
import paths from "./paths";
import commonConfig from "./webpack.common";

const developmentConfig: Configuration = {
    mode: "development",
    devtool: "eval-source-map",
    output: {
        path: paths.appBuild,
        filename: "[name].js",
        publicPath: "http://localhost:3001/",
    },
    plugins: [
        new CopyPlugin({
            patterns: [{ from: path.resolve(paths.appPublic, "i18n"), to: path.resolve(paths.appBuild, "i18n") }],
        }),
    ],
};

export default merge(commonConfig, developmentConfig);

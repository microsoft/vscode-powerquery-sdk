/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as path from "path";
import type { Configuration } from "webpack";

export default function configureWebpack(
    _environment: Record<string, unknown> | undefined,
    arguments_: { mode?: string },
): Configuration {
    const production: boolean = arguments_.mode === "production";

    return {
        target: "node",
        mode: production ? "production" : "development",
        devtool: production ? undefined : "source-map",
        entry: {
            debugAdapter: "./src/debugAdapter.ts",
            extension: "./src/extension.ts",
        },
        output: {
            path: path.resolve(__dirname, "dist"),
            filename: "[name].js",
            libraryTarget: "commonjs2",
        },
        externals: {
            vscode: "commonjs vscode",
        },
        resolve: {
            extensions: [".ts", ".js"],
        },
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    exclude: [/node_modules/, /src[\\/]test[\\/]/, /unit-tests/],
                    use: [
                        {
                            loader: "ts-loader",
                            options: {
                                configFile: path.resolve(__dirname, "tsconfig.json"),
                            },
                        },
                    ],
                },
            ],
        },
        infrastructureLogging: {
            level: "log",
        },
    };
}

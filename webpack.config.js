//@ts-check
/** @typedef {import("webpack").Configuration} WebpackConfig */

"use strict";

const path = require("path");

/**
 * @param {Record<string, unknown> | undefined} env
 * @param {{ mode?: string }} argv
 * @returns {WebpackConfig}
 */
module.exports = function (env, argv) {
    return {
        target: "node", // vscode extensions run in a Node.js-context 📖 -> https://webpack.js.org/configuration/node/
        mode: argv.mode === "production" ? "production" : "development", // this leaves the source code as close as possible to the original (when packaging we set this to 'production')
        devtool: argv.mode === "production" ? undefined : "source-map",

        entry: {
            debugAdapter: "./src/debugAdapter.ts",
            extension: "./src/extension.ts",
        }, // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
        output: {
            // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
            path: path.resolve(__dirname, "dist"),
            filename: "[name].js",
            libraryTarget: "commonjs2",
        },
        externals: {
            vscode: "commonjs vscode", // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
            // modules added here also need to be added in the .vscodeignore file
        },
        resolve: {
            // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
            extensions: [".ts", ".js"],
        },
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    exclude: [
                        /node_modules/,
                        /src[\\\/]test[\\\/]/,
                        /unit-tests/
                    ],
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
            level: "log", // enables logging required for problem matchers
        },
    };
};

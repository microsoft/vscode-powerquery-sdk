/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

"use strict";

const path = require("path");
const fs = require("fs");

// Make sure any symlinks in the project folder are resolved:
// https://github.com/facebook/create-react-app/issues/637
const appDirectory = fs.realpathSync(process.cwd());
const resolveApp = relativePath => path.resolve(appDirectory, relativePath);

const moduleFileExtensions = [".js", ".jsx", ".ts", ".tsx", ".css", ".scss"];

// Resolve file paths in the same order as webpack
const resolveModule = (resolveFn, filePath) => {
    const extension = moduleFileExtensions.find(extension => fs.existsSync(resolveFn(`${filePath}.${extension}`)));

    if (extension) {
        return resolveFn(`${filePath}.${extension}`);
    }

    return resolveFn(`${filePath}.js`);
};

// config after eject: we're in ./config/
module.exports = {
    dotenv: resolveApp(".env"),
    appPath: resolveApp("."),
    appBuild: resolveApp("../../webviewDist/pq-test-result-view"),
    appPublic: resolveApp("public"),
    appHtml: resolveApp("public/index.html"),
    appIndexJs: resolveModule(resolveApp, "src/index"),
    appPackageJson: resolveApp("package.json"),
    appSrc: resolveApp("src"),
    appTsConfig: resolveApp("tsconfig.json"),
    appJsConfig: resolveApp("jsconfig.json"),
    yarnLockFile: resolveApp("yarn.lock"),
    testsSetup: resolveModule(resolveApp, "src/setupTests"),
    proxySetup: resolveApp("src/setupProxy.js"),
    appNodeModules: resolveApp("node_modules"),
    swSrc: resolveModule(resolveApp, "src/service-worker"),
};

module.exports.moduleFileExtensions = moduleFileExtensions;

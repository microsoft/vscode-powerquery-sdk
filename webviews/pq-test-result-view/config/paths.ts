/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as fs from "fs";
import * as path from "path";

const appDirectory: string = fs.realpathSync(process.cwd());
const resolveApp = (relativePath: string): string => path.resolve(appDirectory, relativePath);

export const moduleFileExtensions: string[] = [".js", ".jsx", ".ts", ".tsx", ".css"];

const resolveModule = (resolveFunction: (relativePath: string) => string, filePath: string): string => {
    const extension: string | undefined = moduleFileExtensions.find(current =>
        fs.existsSync(resolveFunction(`${filePath}${current}`)),
    );

    return extension ? resolveFunction(`${filePath}${extension}`) : resolveFunction(`${filePath}.js`);
};

const paths = {
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

export default paths;

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as fs from "fs";
import * as path from "path";
import * as process from "process";

import { GlobSync, IGlobBase } from "glob";

const projectDirectory: string = process.cwd();

// do not remove out directory, which would be required by e2e test cases
// const outDirectory: string = path.join(projectDirectory, "out");
const distDirectory: string = path.join(projectDirectory, "dist");
const webviewDistDirectory: string = path.join(projectDirectory, "webviewDist");

[distDirectory, webviewDistDirectory].forEach((oneDirectory: string) => {
    if (fs.existsSync(oneDirectory)) {
        fs.rmSync(oneDirectory, { force: true, recursive: true });
    }
});

const otherPackageNlsJsonsGlob: IGlobBase = new GlobSync("package.nls.**.json", { cwd: projectDirectory });

otherPackageNlsJsonsGlob.found.forEach((oneNlsJson: string) => {
    fs.unlinkSync(path.join(projectDirectory, oneNlsJson));
});

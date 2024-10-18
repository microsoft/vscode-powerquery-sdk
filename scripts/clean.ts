/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as glob from "glob";
import * as fs from "fs";
import * as path from "path";
import * as process from "process";

const projectDirectory: string = process.cwd();

const outDirectory: string = path.join(projectDirectory, "out");
const distDirectory: string = path.join(projectDirectory, "dist");
const webviewDistDirectory: string = path.join(projectDirectory, "webviewDist");

[outDirectory, distDirectory, webviewDistDirectory].forEach((oneDirectory: string) => {
    if (fs.existsSync(oneDirectory)) {
        fs.rmSync(oneDirectory, { force: true, recursive: true });
    }
});

const otherPackageNlsJsonsGlob: string[] = glob.globSync("package.nls.**.json", { cwd: projectDirectory });

otherPackageNlsJsonsGlob.forEach((oneNlsJson: string) => {
    fs.unlinkSync(path.join(projectDirectory, oneNlsJson));
});

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import fs from "fs";

export function getFirstVsixFileDirectlyBeneathOneDirectory(targetDirectory: string) {
    const dirents: fs.Dirent[] = fs.readdirSync(targetDirectory, { withFileTypes: true });

    let oneVsixFile: string = "";

    dirents.some((dirent: fs.Dirent) => {
        if (!dirent.isDirectory() && dirent.name.endsWith(".vsix")) {
            oneVsixFile = dirent.name;
            return true;
        }
        return false;
    });

    return oneVsixFile;
}

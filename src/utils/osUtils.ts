/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { makeId } from "./ids";

export function makeOneTmpDir(): string {
    const tmpDir: string = os.tmpdir();
    const tmpDirBaseName: string = makeId(7);
    const targetDir: string = path.join(tmpDir, tmpDirBaseName);
    fs.mkdirSync(targetDir);

    return targetDir;
}

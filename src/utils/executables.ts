/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as fs from "fs";
import * as path from "path";
import * as process from "process";

export function findExecutable(exeName: string, extArr: string[] = [""]): string | undefined {
    const envPath: string = process.env.PATH ?? "";
    const pathDirectories: string[] = envPath.replace(/["]+/g, "").split(path.delimiter).filter(Boolean);
    let result: string | undefined = undefined;

    pathDirectories.some((oneDirectory: string) =>
        extArr.some((oneExt: string) => {
            let maybeFsStat: fs.Stats | undefined = undefined;

            try {
                const thePath: string = path.join(oneDirectory, exeName + oneExt);

                if (fs.existsSync(thePath)) {
                    maybeFsStat = fs.statSync(path.join(oneDirectory, exeName + oneExt));
                }
            } catch (e) {
                // noop
            }

            if (maybeFsStat?.isFile()) {
                result = path.join(oneDirectory, exeName + oneExt);

                return true;
            }

            return false;
        }),
    );

    return result;
}

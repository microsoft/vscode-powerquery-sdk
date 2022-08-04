/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as fs from "fs";

export function removeDirectoryRecursively(directoryFullName: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Promise<void>((resolve: () => void, reject: (reason?: any) => void) => {
        fs.rm(directoryFullName, { recursive: true, force: true }, (err: NodeJS.ErrnoException | null) => {
            if (err) {
                reject(err);

                return;
            }

            resolve();
        });
    });
}

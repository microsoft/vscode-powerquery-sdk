/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as fs from "fs";
import * as path from "path";

const defaultMatcher: (_: string) => boolean = () => true;

export async function* globFiles(
    dir: string,
    matcher: (path: string) => boolean = defaultMatcher,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
): AsyncGenerator<string, any, void> {
    const dirents: fs.Dirent[] = await fs.promises.readdir(dir, { withFileTypes: true });

    for (const dirent of dirents) {
        const currentFullPath: string = path.resolve(dir, dirent.name);

        if (dirent.isDirectory()) {
            yield* globFiles(currentFullPath, matcher);
        } else if (matcher(currentFullPath)) {
            yield currentFullPath;
        }
    }
}

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

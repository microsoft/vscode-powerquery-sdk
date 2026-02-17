/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { glob } from "glob";
import Mocha from "mocha";
import * as path from "path";

export function run(testsRoot: string, cb: (error: unknown, failures?: number) => void): void {
    // Create the mocha test
    const mocha = new Mocha({
        ui: "tdd",
        color: true,
        timeout: 20000,
        reporter: "spec", // More detailed output
    });

    // The testsRoot points to the directory containing the index.js file
    // We need to search for test files in the same directory (not subdirectories)
    const testDir = path.dirname(testsRoot);

    glob("*.test.js", { cwd: testDir })
        .then(files => {
            // Add files to the test suite
            files.forEach(f => {
                const fullPath = path.resolve(testDir, f);
                mocha.addFile(fullPath);
            });

            if (files.length === 0) {
                cb(new Error("No test files found"), 0);

                return;
            }

            try {
                // Run the mocha test
                mocha.run(failures => {
                    cb(null, failures);
                });
            } catch (err) {
                console.error("Error running tests:", err);
                cb(err);
            }
        })
        .catch(err => {
            console.error("Error finding test files:", err);
            cb(err);
        });
}

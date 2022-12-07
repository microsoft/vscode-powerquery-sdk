/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as chai from "chai";
import * as fs from "fs";

import { makeOneTmpDir } from "../../src/utils/osUtils";
import { tryRemoveDirectoryRecursively } from "../../src/utils/files";

const expect = chai.expect;

describe("Utils unit testes", () => {
    it("Create a tmp directory", async () => {
        const oneTmpDir = makeOneTmpDir();

        expect(fs.existsSync(oneTmpDir)).true;

        await tryRemoveDirectoryRecursively(oneTmpDir);
    });
});

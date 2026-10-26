/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { expect } from "chai";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { getLocalSdkToolsLocation, initializeLocalSdkTools } from "../src/utils/localSdkTools";

describe("Local SDK Tools override", () => {
    let root: string;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "pq-local-tools-"));
        fs.writeFileSync(path.join(root, "PQTest.exe"), "");
        fs.writeFileSync(path.join(root, "MakePQX.exe"), "");
    });

    afterEach(() => {
        initializeLocalSdkTools(false);
        fs.rmSync(root, { recursive: true, force: true });
    });

    it("selects an existing extracted tools directory", () => {
        initializeLocalSdkTools(true, root);
        expect(getLocalSdkToolsLocation()).to.equal(root);
    });

    it("ignores the override outside development and test hosts", () => {
        initializeLocalSdkTools(false, "invalid");
        expect(getLocalSdkToolsLocation()).to.be.undefined;
    });

    it("leaves acquisition unchanged when the variable is absent", () => {
        const previous = process.env.PQSDK_TEST_TOOLS_PATH;
        delete process.env.PQSDK_TEST_TOOLS_PATH;

        try {
            initializeLocalSdkTools(true);
            expect(getLocalSdkToolsLocation()).to.be.undefined;
        } finally {
            if (previous !== undefined) {
                process.env.PQSDK_TEST_TOOLS_PATH = previous;
            }
        }
    });

    it("rejects empty and relative paths instead of silently falling back", () => {
        expect(() => initializeLocalSdkTools(true, "")).to.throw("absolute path");
        expect(() => initializeLocalSdkTools(true, "relative")).to.throw("absolute path");
    });

    it("rejects a directory missing the build tool", () => {
        fs.unlinkSync(path.join(root, "MakePQX.exe"));
        expect(() => initializeLocalSdkTools(true, root)).to.throw("MakePQX.exe");
        expect(getLocalSdkToolsLocation()).to.be.undefined;
    });

    it("rejects directories named like executables", () => {
        fs.unlinkSync(path.join(root, "PQTest.exe"));
        fs.mkdirSync(path.join(root, "PQTest.exe"));
        expect(() => initializeLocalSdkTools(true, root)).to.throw("PQTest.exe");
    });
});

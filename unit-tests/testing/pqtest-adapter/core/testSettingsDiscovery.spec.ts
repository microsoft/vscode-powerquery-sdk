/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as fs from "fs";
import * as path from "path";

import { describe, it } from "mocha";
import { expect } from "chai";

import { ExtensionConstants } from "../../../../src/constants/PowerQuerySdkExtension";

describe("testSettingsDiscovery", () => {
    it("should use a non-recursive glob when scanning configured directories", () => {
        expect(ExtensionConstants.TestAdapter.TestSettingsFilePattern).to.equal("*.testsettings.json");
        expect(ExtensionConstants.TestAdapter.TestSettingsFilePattern).not.to.include("**/");
    });

    it("should not activate by scanning the workspace for test settings files", () => {
        const packageJsonPath: string = path.resolve(__dirname, "../../../../package.json");
        const packageJson: { activationEvents?: string[] } = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

        expect(packageJson.activationEvents).to.be.an("array");
        expect(packageJson.activationEvents).not.to.include("workspaceContains:**/*.testsettings.json");
    });
});

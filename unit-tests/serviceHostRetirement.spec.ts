/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";

describe("Retired service-host configuration", () => {
    const root = path.resolve(__dirname, "..");
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    const setting = manifest.contributes.configuration.properties["powerquery.sdk.features.useServiceHost"];

    it("retains an ignored boolean setting with localized deprecation metadata", () => {
        expect(setting.type).to.equal("boolean");
        expect(setting.default).to.equal(false);
        expect(setting.description).to.match(/^%.*%$/);
        expect(setting.deprecationMessage).to.match(/^%.*%$/);
        expect(setting.markdownDeprecationMessage).to.match(/^%.*%$/);
    });

    const localeDirectory = path.join(root, "localize", "i18n");
    const resources = [
        path.join(root, "package.nls.json"),
        ...fs.readdirSync(localeDirectory).map(locale => path.join(localeDirectory, locale, "package.nls.json")),
    ];

    for (const resource of resources) {
        it(`provides deprecation text for ${path.relative(root, resource)}`, () => {
            const strings = JSON.parse(fs.readFileSync(resource, "utf8"));

            for (const field of ["description", "deprecationMessage", "markdownDeprecationMessage"]) {
                const key = setting[field].slice(1, -1);
                expect(strings[key]).to.be.a("string").and.not.empty;
                expect(strings[key]).to.contain("PQTest.exe");
            }
        });
    }

    it("contains no production backend selection, host client, discovery, or RPC paths", () => {
        function checkDirectory(directory: string): void {
            for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
                const fullPath = path.join(directory, entry.name);

                if (entry.isDirectory() && entry.name !== "test") {
                    checkDirectory(fullPath);
                } else if (entry.isFile() && entry.name.endsWith(".ts")) {
                    const source = fs.readFileSync(fullPath, "utf8");
                    expect(source, path.relative(root, fullPath)).not.to.match(
                        /useServiceHost|PqServiceHost|PQServiceHost|requestRemoteRpcMethod|JsonRpcSocketClient/,
                    );
                }
            }
        }

        checkDirectory(path.join(root, "src"));
        expect(manifest.dependencies).not.to.have.property("vscode-jsonrpc");
        expect(manifest.devDependencies).not.to.have.property("ws");
        expect(manifest.devDependencies).not.to.have.property("@types/ws");
    });
});

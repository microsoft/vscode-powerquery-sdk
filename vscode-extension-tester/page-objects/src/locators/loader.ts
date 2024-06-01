/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as fs from "fs-extra";
import * as path from "path";

import { DeepPartial, DeepRequired, Merge } from "ts-essentials";
import { LocatorDiff, Locators } from "./locators";
import clone from "clone-deep";
import { compareVersions } from "compare-versions";

/**
 * Utility for loading locators for a given vscode version
 */
export class LocatorLoader {
    private baseVersion: string;
    private baseFolder: string;
    private version: string;
    private locators: Locators;

    /**
     * Construct new loader for a given vscode version
     * @param version select version of vscode
     */
    constructor(version: string, baseVersion: string, baseFolder: string) {
        this.version = version;

        if (version.endsWith("-insider")) {
            this.version = version.substring(0, version.indexOf("-insider"));
        }

        this.baseVersion = baseVersion;
        this.baseFolder = path.resolve(baseFolder);
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const temp: { locators: Locators } = require(path.resolve(baseFolder, baseVersion));
        this.locators = temp.locators as Locators;
    }

    /**
     * Loads locators for the selected vscode version
     * @returns object containing all locators
     */
    loadLocators(): Locators {
        let versions: string[] = fs
            .readdirSync(this.baseFolder)
            .filter((file: string) => file.endsWith(".js"))
            .map((file: string) => path.basename(file, ".js"));

        if (compareVersions(this.baseVersion, this.version) === 0) {
            return this.locators;
        }

        if (compareVersions(this.baseVersion, this.version) < 0) {
            versions = versions
                .filter(
                    (ver: string) =>
                        compareVersions(this.baseVersion, ver) < 0 && compareVersions(ver, this.version) <= 0,
                )
                .sort(compareVersions);
        } else {
            versions = versions
                .filter(
                    (ver: string) =>
                        compareVersions(this.baseVersion, ver) > 0 && compareVersions(ver, this.version) >= 0,
                )
                .sort(compareVersions)
                .reverse();
        }

        for (let i: number = 0; i < versions.length; i++) {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const diff: LocatorDiff = require(path.join(this.baseFolder, versions[i])).diff as LocatorDiff;

            const newLocators: Merge<Locators, DeepPartial<Locators>> = mergeLocators(this.locators, diff);
            this.locators = newLocators as DeepRequired<Merge<Locators, DeepPartial<Locators>>>;
        }

        return this.locators;
    }
}

function mergeLocators(original: Locators, diff: LocatorDiff): Locators {
    const target: Locators = clone(original);
    const targetDiff: DeepPartial<Locators> = diff.locators;

    merge(target, targetDiff) as Locators;

    return target;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function merge(target: any, obj: any): any {
    for (const key in obj) {
        if (key === "__proto__" || !Object.prototype.hasOwnProperty.call(obj, key)) {
            continue;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const oldVal: any = obj[key];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const newVal: any = target[key];

        if (typeof newVal === "object" && typeof oldVal === "object") {
            target[key] = merge(newVal, oldVal);
        } else {
            target[key] = clone(oldVal);
        }
    }

    return target;
}

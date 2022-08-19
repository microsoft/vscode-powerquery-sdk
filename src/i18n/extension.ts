/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as fs from "fs";
import * as path from "path";

import defaultJson from "i18n/extension.json";
import { ExtensionConfigurations } from "constants/PowerQuerySdkConfiguration";
import { RecordKeys } from "utils/types";

export type ExtensionI18nRecord = typeof defaultJson;
export type ExtensionI18nKeys = RecordKeys<ExtensionI18nRecord>;

const currentFolder: string = __dirname;
let currentLocale: string = "en-US";
let currentLocaleJson: Partial<ExtensionI18nRecord> = defaultJson;

function createExtensionI18nRecord(): ExtensionI18nRecord {
    return new Proxy<ExtensionI18nRecord>(defaultJson, {
        get(target: ExtensionI18nRecord, property: ExtensionI18nKeys, _receiver: unknown): string {
            return currentLocaleJson[property] ?? target[property];
        },
    });
}

export function handleLocaleChanged(nextLocale?: string): void {
    nextLocale = nextLocale ?? ExtensionConfigurations.pqLocale;
    const expectedLocalJsonPath: string = path.join(currentFolder, `extension.${nextLocale}.json`);

    if (currentLocale !== nextLocale && fs.existsSync(expectedLocalJsonPath)) {
        const expectedLocaleContent: string = fs.readFileSync(expectedLocalJsonPath, { encoding: "utf-8" });

        try {
            currentLocaleJson = JSON.parse(expectedLocaleContent);
        } catch (e) {
            // noop
        }
    } else {
        currentLocaleJson = defaultJson;
    }

    currentLocale = nextLocale;
}

// todo populate the template if needed

handleLocaleChanged();

export const extensionI18nRecord: ExtensionI18nRecord = createExtensionI18nRecord();

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as fs from "fs";
import * as path from "path";

import defaultJson from "../i18n/extension.json";
import { ExtensionConfigurations } from "../constants/PowerQuerySdkConfiguration";
import { RecordKeys } from "../utils/types";
import { replaceAt } from "../utils/strings";

export type ExtensionI18nRecord = typeof defaultJson;
export type ExtensionI18nKeys = RecordKeys<ExtensionI18nRecord>;

const currentFolder: string = __dirname;
let currentLocale: string = "en";
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

handleLocaleChanged();

export const extensionI18n: ExtensionI18nRecord = createExtensionI18nRecord();

const I18nTemplateItemRegex: RegExp = /{([a-zA-Z0-9_]*)}/gm;

// we might share doResolveI18nTemplate with another i18n record
function doResolveI18nTemplate<R extends Record<string, string>>(
    i18nRecord: R,
    i18nKey: RecordKeys<R>,
    argumentsPackage: Record<string, string | null | undefined> = {},
): string {
    let result: string = i18nRecord[i18nKey];

    I18nTemplateItemRegex.lastIndex = 0;
    let curMatch: RegExpExecArray | null = I18nTemplateItemRegex.exec(result);

    while (curMatch) {
        const theMatchedArgumentName: string = curMatch[1];
        let theReplacedStr: string = "";

        if (theMatchedArgumentName && argumentsPackage[theMatchedArgumentName]) {
            theReplacedStr = argumentsPackage[theMatchedArgumentName] ?? theMatchedArgumentName;
        } else if (theMatchedArgumentName) {
            theReplacedStr = theMatchedArgumentName;
        }

        result = replaceAt(result, curMatch.index, curMatch[0].length, theReplacedStr);
        I18nTemplateItemRegex.lastIndex = curMatch.index + theReplacedStr.length;
        curMatch = I18nTemplateItemRegex.exec(result);
    }

    return result;
}

export function resolveI18nTemplate(
    i18nKey: ExtensionI18nKeys,
    argumentsPackage: Record<string, string | null | undefined> = {},
): string {
    return doResolveI18nTemplate<ExtensionI18nRecord>(extensionI18n, i18nKey, argumentsPackage);
}

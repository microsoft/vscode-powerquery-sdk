/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import type * as nls from "vscode-nls";

import defaultJson from "i18n/extension.json";
import { RecordKeys } from "utils/types";

export type ExtensionI18nRecord = typeof defaultJson;
export type ExtensionI18nKeys = RecordKeys<ExtensionI18nRecord>;

export function createExtensionI18nRecord(localize: nls.LocalizeFunc): ExtensionI18nRecord {
    return new Proxy<ExtensionI18nRecord>(defaultJson, {
        get(target: ExtensionI18nRecord, property: ExtensionI18nKeys, _receiver: unknown): string {
            return localize(property, target[property]);
        },
    });
}

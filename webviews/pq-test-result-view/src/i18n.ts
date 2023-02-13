/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { useMemo } from "react";
import type I18nRecordType from "../public/i18n/pq-test-result-view.json";
import { RecordKeys } from "./utils/types";
import { useVSCodeContextProps } from "./contexts/VscodeContexts";

export type I18nRecord = typeof I18nRecordType;
export type I18nKeys = RecordKeys<I18nRecord>;

let defaultLocaleJson: I18nRecord = {} as I18nRecord;
let currentLocaleJson: Partial<I18nRecord> = {};

function createExtensionI18nRecord(): I18nRecord {
    return new Proxy<I18nRecord>(defaultLocaleJson, {
        get(target: I18nRecord, property: I18nKeys, _receiver: unknown): string {
            return currentLocaleJson[property] ?? target[property];
        },
    });
}

let i18nRecord: I18nRecord | undefined = undefined;
let activateDefaultLocaleJsonDeferred: Promise<Partial<I18nRecord>> | undefined = undefined;

const defaultLocaleJsonUrl = "i18n/pq-test-result-view.json";

const noCacheHeaders = new Headers();
noCacheHeaders.append("pragma", "no-cache");
noCacheHeaders.append("cache-control", "no-cache");
const noCacheGetInit = {
    method: "GET",
    headers: noCacheHeaders,
};

export function handleLocaleChange(nextLocal = "en"): Promise<unknown> {
    let targetUrl = defaultLocaleJsonUrl;
    if (!activateDefaultLocaleJsonDeferred) {
        activateDefaultLocaleJsonDeferred = (async () => {
            const res = await fetch(defaultLocaleJsonUrl, noCacheGetInit);
            if (res.ok) {
                defaultLocaleJson = (await res.json()) as I18nRecord;
                i18nRecord = createExtensionI18nRecord();
            }
            return defaultLocaleJson;
        })();
    }
    if (nextLocal.toLowerCase() === "en") {
        return activateDefaultLocaleJsonDeferred;
    } else {
        targetUrl = `i18n/pq-test-result-view.${nextLocal.toLowerCase()}.json`;
    }

    const activateCurrentLocaleJsonDeferred = (async () => {
        const res = await fetch(targetUrl, noCacheGetInit);
        if (res.ok) {
            currentLocaleJson = (await res.json()) as Partial<I18nRecord>;
        }
        return currentLocaleJson;
    })();

    return Promise.all([activateDefaultLocaleJsonDeferred, activateCurrentLocaleJsonDeferred]);
}

export function useI18n(key: I18nKeys) {
    const { locale } = useVSCodeContextProps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return useMemo(() => i18nRecord?.[key] ?? "", [locale, key, i18nRecord]);
}

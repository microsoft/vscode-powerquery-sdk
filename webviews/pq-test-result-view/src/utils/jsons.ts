/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { JsonObject } from "../types";

export const flattenJSON = (obj: JsonObject = {}, res: JsonObject = {}, extraKey = ""): JsonObject => {
    for (const key in obj) {
        const value = obj[key];
        if (typeof value !== "object" || value === null) {
            res[extraKey + key] = value;
        } else if (Array.isArray(value)) {
            res[extraKey + key] = value;
        } else {
            flattenJSON(value as JsonObject, res, `${extraKey}${key}.`);
        }
    }
    return res;
};

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

export const flattenJSON = (obj: any = {}, res: any = {}, extraKey = "") => {
    for (const key in obj) {
        if (typeof obj[key] !== "object") {
            res[extraKey + key] = obj[key];
        } else {
            flattenJSON(obj[key], res, `${extraKey}${key}.`);
        }
    }
    return res;
};

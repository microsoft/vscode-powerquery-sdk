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

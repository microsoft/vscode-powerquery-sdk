/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

export function replaceAt(str: string, index: number, length: number, replacement: string): string {
    return str.substring(0, index) + replacement + str.substring(index + length);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function stringifyJson(obj: any): string {
    return JSON.stringify(obj);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function prettifyJson(obj: any): string {
    return JSON.stringify(obj, null, 4);
}

const TemplateSubstitutedValueRegexp: RegExp = /{{([A-Za-z0-9.]*)}}/g;

function doResolveOneTemplateSubstitutedValue(valueName: string, context: Record<string, string>): string {
    // eslint-disable-next-line security/detect-object-injection
    return context[valueName] ?? "";
}

// todo, need to think about it....these substituted values could be very annoying...should we support em
// https://code.visualstudio.com/docs/editor/variables-reference
export function resolveTemplateSubstitutedValues(str: string, context: Record<string, string>): string {
    if (str) {
        let result: string = str;
        let curMatch: RegExpExecArray | null = TemplateSubstitutedValueRegexp.exec(result ?? "");

        while (curMatch && result) {
            result = replaceAt(
                result,
                curMatch.index,
                curMatch[0].length,
                doResolveOneTemplateSubstitutedValue(curMatch[1], context),
            );

            curMatch = TemplateSubstitutedValueRegexp.exec(result ?? "");
        }

        return result;
    }

    return str;
}

export function getNonce(): string {
    let text: string = "";
    const possible: string = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for (let i: number = 0; i < 32; ++i) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }

    return text;
}

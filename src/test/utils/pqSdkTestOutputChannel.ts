/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import type { PqSdkOutputChannelLight } from "../../features/PqSdkOutputChannel";

export class PqSdkTestOutputChannel implements PqSdkOutputChannelLight {
    private readonly _lines: string[] = [];

    public appendInfoLine(value: string): void {
        this._lines.push(`\t\t[test][info] ${value}`);
    }

    public appendErrorLine(value: string): void {
        this._lines.push(`\t\t[test][error] ${value}`);
    }

    public emit(): void {
        for (const line of this._lines) {
            console.log(line);
        }

        this._lines.length = 0;
    }
}

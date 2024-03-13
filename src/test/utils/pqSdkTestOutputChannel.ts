/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import type { PqSdkOutputChannelLight } from "../../features/PqSdkOutputChannel";

export class PqSdkTestOutputChannel implements PqSdkOutputChannelLight {
    public appendInfoLine(value: string): void {
        console.info(value);
    }

    public appendErrorLine(value: string): void {
        console.error(value);
    }
}

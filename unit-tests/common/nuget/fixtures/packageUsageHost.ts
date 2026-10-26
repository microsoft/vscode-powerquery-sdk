/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { protectNugetPackage } from "../../../../src/utils/nugetPackageUsage";

process.on("disconnect", () => process.exit(0));

async function protect(): Promise<void> {
    try {
        await protectNugetPackage(process.argv[2], process.argv[3]);
        process.send?.({ protected: true });
    } catch (error: unknown) {
        process.send?.({ protected: false, error: String(error) });
    }
}

void protect();

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as path from "path";

export const extensionId: string = "vscode-powerquery-sdk" as const;

export const extensionDevelopmentPath = path.resolve(__dirname, "../../../");

export const NugetBaseFolder: string = ".nuget" as const;

export const PqTestNugetName: string = "Microsoft.PowerQuery.SdkTools" as const;
export const PqTestNugetVersion: string = "2.106.2" as const;

export const PqTestSubPath: string[] = [`${PqTestNugetName}.${PqTestNugetVersion}`, "tools", "PQTest.exe"];

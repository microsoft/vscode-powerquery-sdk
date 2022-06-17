/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { ExtensionConstants } from "../../constants/PowerQuerySdkExtension";

import * as path from "path";

export const extensionId: string = "vscode-powerquery-sdk" as const;

export const extensionDevelopmentPath = path.resolve(__dirname, "../../../");

export const NugetBaseFolder: string = ExtensionConstants.NugetBaseFolder;

export const PqTestSubPath: string[] = ExtensionConstants.PqTestSubPath;

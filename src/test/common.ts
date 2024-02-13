/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { ExtensionConstants } from "../constants/PowerQuerySdkExtension";

import * as os from "os";
import * as path from "path";

import extension18nJson from "../i18n/extension.json";
import root18nJson from "../../package.nls.json";
import rootPackageJson from "../../package.json";

export const rootI18n = root18nJson;
export const extensionI18n = extension18nJson;

export const defaultPqCommandCategory = "Power query";
export const pqSdkOutputChannelName: string = "Power Query SDK";

export const MAX_AWAIT_TIME: number = 2 * 60e3;
export const AWAIT_INTERVAL: number = 5e3;

export const extensionId: string = rootPackageJson.name;
export const extensionVersion: string = rootPackageJson.version;
export const extensionPublisher: string = rootPackageJson.publisher;
export const extensionLanguageServiceId: string = ExtensionConstants.PQLanguageServiceExtensionId;

export const homeDirectory = os.homedir();
export const extensionDevelopmentPath = path.resolve(__dirname, "../../../");
export const extensionInstalledDirectory = path.join(
    homeDirectory,
    ".vscode",
    "extensions",
    `${extensionPublisher.toLowerCase()}.${extensionId.toLowerCase()}-${extensionVersion.toLowerCase()}`,
);

export const NugetBaseFolderName: string = ExtensionConstants.NugetBaseFolder;

export const NugetPackagesDirectory: string = path.join(extensionInstalledDirectory, NugetBaseFolderName);

export const PqTestSubPath: string[] = ExtensionConstants.PqTestSubPath;
export const buildPqSdkSubPath: (version: string) => string[] = (version: string) =>
    ExtensionConstants.buildNugetPackageSubPath(ExtensionConstants.InternalMsftPqSdkToolsNugetName, version);

export const PublicMsftPqSdkToolsNugetName: string = ExtensionConstants.PublicMsftPqSdkToolsNugetName;
export const MaximumPqTestNugetVersion: string = ExtensionConstants.MaximumPqTestNugetVersion;

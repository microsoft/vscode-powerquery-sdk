/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as os from "os";

// todo: should we rename it into ms.vscode-powerquery-sdk which is more authentic?
const ExtensionId: string = "vscode-powerquery-sdk";

export type PqModeType = "Power Query" | "SDK";
export type SdkExternalsVersionTags = "Recommended" | "Latest" | "Custom";

// eslint-disable-next-line @typescript-eslint/typedef
const ConfigNames = {
    http: {
        proxy: "http.proxy",
        proxyAuthorization: "http.proxyAuthorization",
    },
    PowerQuery: {
        name: "powerquery",
        properties: {
            locale: "general.locale" as const,
            mode: "general.mode" as const,
        },
    },
    PowerQuerySdk: {
        name: "powerquery.sdk" as const,
        properties: {
            deprecatedPqTestLocation: "pqtest.location" as const,
            deprecatedPqTestExtensionFileLocation: "pqtest.extension" as const,
            deprecatedPqTestQueryFileLocation: "pqtest.queryFile" as const,
            autoDetection: "features.autoDetection" as const,
            externalsMsbuildPath: "externals.msbuildPath" as const,
            externalsNugetPath: "externals.nugetPath" as const,
            externalsNugetFeed: "externals.nugetFeed" as const,
            externalsVersionTag: "externals.versionTag" as const,
            pqTestLocation: "tools.location" as const,
            pqTestVersion: "tools.version" as const,
            defaultExtensionLocation: "defaultExtension" as const,
            defaultQueryFileLocation: "defaultQueryFile" as const,
            featureUseServiceHost: "features.useServiceHost" as const,
        },
    },
};

const ConfigPathToConnector: string =
    "${config:" +
    `${ConfigNames.PowerQuerySdk.name}.${ConfigNames.PowerQuerySdk.properties.defaultExtensionLocation}` +
    "}";

const ConfigPathToTestConnectionFile: string =
    "${config:" +
    `${ConfigNames.PowerQuerySdk.name}.${ConfigNames.PowerQuerySdk.properties.defaultQueryFileLocation}` +
    "}";

const PQLanguageId: string = "powerquery";
const PQLanguageServiceExtensionId: string = "powerquery.vscode-powerquery";
const OutputChannelName: string = "Power Query SDK";
const PowerQueryTaskType: string = PQLanguageId;
const PQDebugType: string = PowerQueryTaskType;

const NugetBaseFolder: string = ".nuget" as const;
const InternalMsftPqSdkToolsNugetName: string = "Microsoft.PowerQuery.SdkTools" as const;
const PublicMsftPqSdkToolsNugetName: string = InternalMsftPqSdkToolsNugetName;
/**
 *  Inclusive maximum nuget version
 *  2.117 or 2.117.x wil limit the version of the sdkTool seized beneath 2.118
 */
const MaximumPqTestNugetVersion: string = "2.140.x" as const;
/**
 *  Exclusive minimum nuget version
 *  2.114 or 2.114.x wil limit the version of the sdkTool seized above 2.114.x like 2.115.0
 */
const MinimumPqTestNugetVersion: string = "2.118.x" as const;
/**
 * A suggestedPqTestNugetVersion that would be used as the initially tried pqTest version
 * thus, make sure it is lower than `MaximumPqTestNugetVersion` if it were specified
 */
const SuggestedPqTestNugetVersion: string = "2.127.2" as const;

const PqTestSubPath: string[] = [
    `${InternalMsftPqSdkToolsNugetName}.${SuggestedPqTestNugetVersion}`,
    "tools",
    "PQTest.exe",
];

const MakePQXExecutableName: string = "MakePQX.exe" as const;

function buildNugetPackageSubPath(packageName: string, version: string): string[] {
    return [`${packageName}.${version}`, "tools", "PQTest.exe"];
}

const NugetDownloadUrl: string = "https://www.nuget.org/downloads" as const;
const MSBuildDownloadUrl: string = "https://visualstudio.microsoft.com/downloads/?q=build+tools" as const;

/**
 * It might be bash script like:
 *     `exec /usr/bin/memo /usr/lib/mono/nuget/Nuget.exe`
 */
const NugetExecutableName: string = os.type() === "Windows_NT" ? "Nuget.exe" : "nuget";

const MSBuildExecutableName: string = "MSBuild.exe" as const;

// eslint-disable-next-line @typescript-eslint/typedef
export const ExtensionConstants = Object.freeze({
    ExtensionId,
    ConfigPathToConnector,
    ConfigPathToTestConnectionFile,
    PQLanguageId,
    PQLanguageServiceExtensionId,
    OutputChannelName,
    PowerQueryTaskType,
    PQDebugType,
    NugetBaseFolder,
    InternalMsftPqSdkToolsNugetName,
    PublicMsftPqSdkToolsNugetName,
    SuggestedPqTestNugetVersion,
    MaximumPqTestNugetVersion,
    MinimumPqTestNugetVersion,
    PqTestSubPath,
    MakePQXExecutableName,
    buildNugetPackageSubPath,
    ConfigNames,
    NugetDownloadUrl,
    MSBuildDownloadUrl,
    NugetExecutableName,
    MSBuildExecutableName,
});

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

// eslint-disable-next-line @typescript-eslint/typedef
const ConfigNames = {
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
            autoDetection: "project.autoDetection" as const,
            externalsMsbuildPath: "externals.msbuildPath" as const,
            externalsNugetPath: "externals.nugetPath" as const,
            pqTestLocation: "pqtest.location" as const,
            pqTestExtensionFileLocation: "pqtest.extension" as const,
            pqTestQueryFileLocation: "pqtest.queryFile" as const,
            featureUseServiceHost: "features.useServiceHost" as const,
        },
    },
};

const ConfigPathToConnector: string =
    "${config:" +
    `${ConfigNames.PowerQuerySdk.name}.${ConfigNames.PowerQuerySdk.properties.pqTestExtensionFileLocation}` +
    "}";

const ConfigPathToTestConnectionFile: string =
    "${config:" +
    `${ConfigNames.PowerQuerySdk.name}.${ConfigNames.PowerQuerySdk.properties.pqTestQueryFileLocation}` +
    "}";

const PQLanguageId: string = "powerquery";
const OutputChannelName: string = "Power Query SDK";
const PowerQueryTaskType: string = PQLanguageId;
const PQDebugType: string = PowerQueryTaskType;

const NugetBaseFolder: string = ".nuget" as const;
const NugetConfigFileName: string = "nuget-staging.config" as const;
const InternalMsftPqSdkToolsNugetName: string = "Microsoft.PowerQuery.SdkTools" as const;
const PublicMsftPqSdkToolsNugetName: string = InternalMsftPqSdkToolsNugetName;
const SuggestedPqTestNugetVersion: string = "2.109.5" as const;

const PqTestSubPath: string[] = [
    `${InternalMsftPqSdkToolsNugetName}.${SuggestedPqTestNugetVersion}`,
    "tools",
    "PQTest.exe",
];

const MakePQXExecutableName: string = "MakePQX.exe" as const;

function buildPqTestSubPath(pqTestVersion: string): string[] {
    return [`${InternalMsftPqSdkToolsNugetName}.${pqTestVersion}`, "tools", "PQTest.exe"];
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
    OutputChannelName,
    PowerQueryTaskType,
    PQDebugType,
    NugetBaseFolder,
    NugetConfigFileName,
    InternalMsftPqSdkToolsNugetName,
    PublicMsftPqSdkToolsNugetName,
    SuggestedPqTestNugetVersion,
    PqTestSubPath,
    MakePQXExecutableName,
    buildPqTestSubPath,
    ConfigNames,
    NugetDownloadUrl,
    MSBuildDownloadUrl,
    NugetExecutableName,
    MSBuildExecutableName,
});

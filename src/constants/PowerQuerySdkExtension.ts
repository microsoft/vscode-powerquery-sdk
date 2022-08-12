/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as os from "os";

// todo: should we rename it into ms.vscode-powerquery-sdk which is more authentic?
const ExtensionId: string = "vscode-powerquery-sdk";

// eslint-disable-next-line @typescript-eslint/typedef
const ConfigNames = {
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
const PqTestNugetName: string = "Microsoft.PowerQuery.SdkTools" as const;
const SuggestedPqTestNugetVersion: string = "2.107.2" as const;

const PqTestSubPath: string[] = [`${PqTestNugetName}.${SuggestedPqTestNugetVersion}`, "tools", "PQTest.exe"];

const MakePQXExecutableName: string = "MakePQX.exe" as const;

function buildPqTestSubPath(pqTestVersion: string): string[] {
    return [`${PqTestNugetName}.${pqTestVersion}`, "tools", "PQTest.exe"];
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
    PqTestNugetName,
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

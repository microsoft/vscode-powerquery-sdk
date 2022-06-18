/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

// todo: should we rename it into ms.vscode-powerquery-sdk which is more authentic?
const ExtensionId: string = "vscode-powerquery-sdk";

// eslint-disable-next-line @typescript-eslint/typedef
const ConfigNames = {
    PowerQuerySdk: {
        name: "powerquery.sdk" as const,
        properties: {
            pqTestLocation: "pqtest.location" as const,
            pqTestExtensionFileLocation: "pqtest.extension" as const,
            pqTestQueryFileLocation: "pqtest.queryFile" as const,
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

const OutputChannelName: string = "Power Query SDK";
const PQTestTaskType: string = "powerquery";

const NugetBaseFolder: string = ".nuget" as const;
const NugetConfigFileName: string = "nuget-staging.config" as const;
const PqTestNugetName: string = "Microsoft.PowerQuery.SdkTools" as const;
const SuggestedPqTestNugetVersion: string = "2.106.2" as const;

const PqTestSubPath: string[] = [`${PqTestNugetName}.${SuggestedPqTestNugetVersion}`, "tools", "PQTest.exe"];

function buildPqTestSubPath(pqTestVersion: string): string[] {
    return [`${PqTestNugetName}.${pqTestVersion}`, "tools", "PQTest.exe"];
}

// eslint-disable-next-line @typescript-eslint/typedef
export const ExtensionConstants = {
    ExtensionId,
    ConfigPathToConnector,
    ConfigPathToTestConnectionFile,
    OutputChannelName,
    PQTestTaskType,
    NugetBaseFolder,
    NugetConfigFileName,
    PqTestNugetName,
    SuggestedPqTestNugetVersion,
    PqTestSubPath,
    buildPqTestSubPath,
    ConfigNames,
};

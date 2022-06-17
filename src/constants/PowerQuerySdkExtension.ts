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

const DotNetRuntimeVersion: string = "6.0" as const;
const NugetBaseFolder: string = ".nuget" as const;
const NugetConfigFileName: string = "nuget-staging.config" as const;
const PqTestNugetName: string = "Microsoft.PowerQuery.SdkTools" as const;
const PqTestNugetVersion: string = "2.106.2" as const;

const PqTestSubPath: string[] = [`${PqTestNugetName}.${PqTestNugetVersion}`, "tools", "PQTest.exe"];

// eslint-disable-next-line @typescript-eslint/typedef
export const ExtensionConstants = {
    ExtensionId,
    ConfigPathToConnector,
    ConfigPathToTestConnectionFile,
    OutputChannelName,
    PQTestTaskType,
    DotNetRuntimeVersion,
    NugetBaseFolder,
    NugetConfigFileName,
    PqTestNugetName,
    PqTestNugetVersion,
    PqTestSubPath,
    ConfigNames,
};

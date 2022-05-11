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
        name: "powerquery.sdk",
        properties: {
            pqTestLocation: "pqtest.location",
            pqTestExtensionFileLocation: "pqtest.extension",
            pqTestQueryFileLocation: "pqtest.queryFile",
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

// eslint-disable-next-line @typescript-eslint/typedef
export const ExtensionConstants = {
    ExtensionId,
    ConfigPathToConnector,
    ConfigPathToTestConnectionFile,
    OutputChannelName,
    PQTestTaskType,
    ConfigNames,
};

export default ExtensionConstants;

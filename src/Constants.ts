// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

export abstract class Constants {
    // TODO: Figure out which configuration setting names we're going to use.
    public static ConfigPathToConnector: string = "${config:pathToMez}";
    public static ConfigPathToTestConnectionFile: string = "${config:pathToTestQuery}";
    public static OutputChannelName: string = "Power Query SDK";
    public static PQTestTaskType: string = "powerquery";
}

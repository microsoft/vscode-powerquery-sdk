/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

// FluentUI Theme type
export interface FluentTheme {
    palette: {
        themePrimary: string;
        themeLighterAlt: string;
        themeLighter: string;
        themeLight: string;
        themeTertiary: string;
        themeSecondary: string;
        themeDarkAlt: string;
        themeDark: string;
        themeDarker: string;
        neutralLighterAlt: string;
        neutralLighter: string;
        neutralLight: string;
        neutralQuaternaryAlt: string;
        neutralQuaternary: string;
        neutralTertiaryAlt: string;
        neutralTertiary: string;
        neutralSecondary: string;
        neutralPrimaryAlt: string;
        neutralPrimary: string;
        neutralDark: string;
        black: string;
        white: string;
    };
}

// VSCode API State
export interface VSCodeState {
    locale?: string;
    latestPqTestResult?: TestRunExecution;
}

// Test execution result types
export interface TestRunExecution {
    Status: string | number;
    Output?: JsonValue[];
    Error?: JsonObject;
    Details?: string;
    StartTime?: string;
    EndTime?: string;
    DataSourceAnalysis?: JsonObject[];
    [key: string]: JsonValue | JsonValue[] | JsonObject | JsonObject[] | undefined;
}

// JSON utility types
export type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
export interface JsonObject {
    [key: string]: JsonValue;
}
export interface JsonArray extends Array<JsonValue> {}

// Grid item types
export interface GridItem {
    [key: string]: JsonValue;
}

// General detail item for flattened display
export interface GeneralDetailItem extends GridItem {
    Item: string;
    Value: JsonValue;
}

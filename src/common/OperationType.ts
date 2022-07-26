/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

export type OperationType = BuildOperationType | PQTestOperationType;

export type BuildOperationType = "msbuild";

export type PQTestOperationType =
    | "delete-credential"
    | "info"
    | "compile"
    | "list-credential"
    | "credential-template"
    | "set-credential"
    | "refresh-credential"
    | "run-test"
    | "test-connection"
    | string;

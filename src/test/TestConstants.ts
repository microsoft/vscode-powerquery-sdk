/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { LifecycleCommands } from "../commands/LifecycleCommands";
import { ExtensionConstants } from "../constants/PowerQuerySdkExtension";

// Re-export command constants from LifecycleCommands for test use
export const Commands = {
    SeizePqTestCommand: LifecycleCommands.SeizePqTestCommand,
    BuildProjectCommand: LifecycleCommands.BuildProjectCommand,
    SetupCurrentWorkspaceCommand: LifecycleCommands.SetupCurrentWorkspaceCommand,
    CreateNewProjectCommand: LifecycleCommands.CreateNewProjectCommand,
    DeleteCredentialCommand: LifecycleCommands.DeleteCredentialCommand,
    DisplayExtensionInfoCommand: LifecycleCommands.DisplayExtensionInfoCommand,
    ListCredentialCommand: LifecycleCommands.ListCredentialCommand,
    GenerateAndSetCredentialCommand: LifecycleCommands.GenerateAndSetCredentialCommand,
    RefreshCredentialCommand: LifecycleCommands.RefreshCredentialCommand,
    RunTestBatteryCommand: LifecycleCommands.RunTestBatteryCommand,
    TestConnectionCommand: LifecycleCommands.TestConnectionCommand,
} as const;

// Extension IDs
export const Extensions = {
    PowerQuerySdk: "PowerQuery.vscode-powerquery-sdk",
    PowerQueryLanguageService: "powerquery.vscode-powerquery",
    PowerQueryLanguageServiceId: ExtensionConstants.PQLanguageServiceExtensionId,
} as const;

// View and Panel IDs
export const Views = {
    LifeCycleTaskTreeView: "powerquery.sdk.tools.LifeCycleTaskTreeView",
    ResultWebView: "powerquery.sdk.tools.ResultWebView",
} as const;

// Common error patterns for command testing
export const CommonErrorPatterns = {
    CommandNotFound: "command not found",
    NoWorkspaceFolder: "No workspace folder",
    UserCancelled: "User cancelled",
    CommandFailed: "command failed",
    DownloadFailed: "download failed",
    NetworkError: "network error",
    PermissionDenied: "permission denied",
    WorkspaceSetupFailed: "workspace setup failed",
    NoCredentials: "no credentials",
    PqTestNotFound: "pqtest not found",
    CredentialNotFound: "credential not found",
    NoActiveEditor: "no active editor",
    NoConnector: "no connector",
    NoQueryFile: "no query file",
    ExtensionNotFound: "extension not found",
    Context: "context",
    Project: "project",
    Workspace: "workspace",
    Cancelled: "cancelled",
} as const;

// Standard acceptable error groups by command type
export const AcceptableErrorGroups = {
    BasicCommand: [
        CommonErrorPatterns.CommandNotFound,
        CommonErrorPatterns.NoWorkspaceFolder,
        CommonErrorPatterns.UserCancelled,
        CommonErrorPatterns.CommandFailed,
    ],
    ToolAcquisition: [
        CommonErrorPatterns.CommandNotFound,
        CommonErrorPatterns.DownloadFailed,
        CommonErrorPatterns.NetworkError,
        CommonErrorPatterns.PermissionDenied,
        CommonErrorPatterns.CommandFailed,
    ],
    WorkspaceSetup: [
        CommonErrorPatterns.CommandNotFound,
        CommonErrorPatterns.NoWorkspaceFolder,
        CommonErrorPatterns.WorkspaceSetupFailed,
        CommonErrorPatterns.CommandFailed,
    ],
    CredentialManagement: [
        CommonErrorPatterns.CommandNotFound,
        CommonErrorPatterns.NoCredentials,
        CommonErrorPatterns.PqTestNotFound,
        CommonErrorPatterns.CredentialNotFound,
        CommonErrorPatterns.CommandFailed,
    ],
    TestExecution: [
        CommonErrorPatterns.CommandNotFound,
        CommonErrorPatterns.NoActiveEditor,
        CommonErrorPatterns.NoConnector,
        CommonErrorPatterns.NoQueryFile,
        CommonErrorPatterns.PqTestNotFound,
        CommonErrorPatterns.ExtensionNotFound,
        CommonErrorPatterns.CommandFailed,
    ],
    ContextCommand: [
        CommonErrorPatterns.Context,
        CommonErrorPatterns.Project,
        CommonErrorPatterns.Workspace,
        CommonErrorPatterns.Cancelled,
    ],
} as const;

// Test timeouts
export const Timeouts = {
    Default: 5000,
    CommandExecution: 10000,
    ExtensionActivation: 30000,
    NetworkOperation: 60000,
} as const;

// Webview configuration constants
export const WebviewConfig = {
    DefaultOptions: {
        enableScripts: true,
        retainContextWhenHidden: true,
    },
    MessageTimeout: 2000,
    InteractionDelay: 100,
} as const;

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { Constants } from "./Constants";
import { ExtensionSettings } from "./ExtensionSettings";
import { PQTestTaskDefinition } from "./PQTestTaskDefinition";

const CommonArgs: string[] = ["--prettyPrint"];
const TaskSource: string = "pqtest";

let _channel: vscode.OutputChannel;
function getOutputChannel(): vscode.OutputChannel {
    if (!_channel) {
        _channel = vscode.window.createOutputChannel(Constants.OutputChannelName);
    }
    return _channel;
}

export class PowerQueryTaskProvider implements vscode.TaskProvider {
    static TaskType: string = Constants.PQTestTaskType;

    // TODO: Do we need to make fetching of settings an async operation?
    private readonly fetchExtensionSettings: () => ExtensionSettings;

    constructor(fetchSettings: () => ExtensionSettings) {
        this.fetchExtensionSettings = fetchSettings;
    }

    public provideTasks(token: vscode.CancellationToken): vscode.ProviderResult<vscode.Task[]> {
        return getPQTestTasks(this.fetchExtensionSettings(), token);
    }

    public resolveTask(task: vscode.Task, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Task> {
        const pqtestExe: string | undefined = calculatePQTestPath(this.fetchExtensionSettings());
        if (pqtestExe && !token.isCancellationRequested) {
            const taskDef: PQTestTaskDefinition = task.definition as PQTestTaskDefinition;
            return getTaskForTaskDefinition(taskDef, pqtestExe);
        }

        return undefined;
    }
}

const pqTestOperations: PQTestTaskDefinition[] = [
    { type: Constants.PQTestTaskType, operation: "list-credential", label: "List credentials" },
    // TODO: Can we prompt to confirm that user really wants to remove all credentials?
    {
        type: Constants.PQTestTaskType,
        operation: "delete-credential",
        label: "Clear ALL credentials",
        additionalArgs: ["--ALL"],
    },
    {
        type: Constants.PQTestTaskType,
        operation: "info",
        label: "Connector info",
        pathToConnector: Constants.ConfigPathToConnector,
    },
    // TODO: We need logic to determine which authentication kind to use (when there is more than one)
    {
        type: Constants.PQTestTaskType,
        operation: "set-credential",
        label: "Set credential",
        additionalArgs: ["--interactive"],
        pathToConnector: Constants.ConfigPathToConnector,
        pathToQueryFile: Constants.ConfigPathToTestConnectionFile,
    },
    // TODO: This one should only be included for connectors with OAuth and Aad
    {
        type: Constants.PQTestTaskType,
        operation: "refresh-credential",
        label: "Refresh credential",
        pathToConnector: Constants.ConfigPathToConnector,
        pathToQueryFile: Constants.ConfigPathToTestConnectionFile,
    },
    // TODO: How can we format the output?
    {
        type: Constants.PQTestTaskType,
        operation: "run-test",
        label: "Evaluate current file",
        pathToConnector: Constants.ConfigPathToConnector,
        pathToQueryFile: "${file}",
    },
    {
        type: Constants.PQTestTaskType,
        operation: "test-connection",
        label: "Test connection",
        pathToConnector: Constants.ConfigPathToConnector,
        pathToQueryFile: Constants.ConfigPathToTestConnectionFile,
    },
];

async function getPQTestTasks(settings: ExtensionSettings, _token: vscode.CancellationToken): Promise<vscode.Task[]> {
    const result: vscode.Task[] = [];
    const pqtestExe: string | undefined = calculatePQTestPath(settings);
    if (!pqtestExe) {
        return result;
    }

    pqTestOperations.forEach(taskDef => {
        result.push(getTaskForTaskDefinition(taskDef, pqtestExe));
    });

    return result;
}

function calculatePQTestPath(settings: ExtensionSettings): string | undefined {
    if (!settings?.PQTestLocation) {
        getOutputChannel().appendLine("powerquery.sdk.pqtest.location configuration value is not set.");
        return undefined;
    } else if (!fs.existsSync(settings.PQTestLocation)) {
        getOutputChannel().appendLine(
            `powerquery.sdk.pqtest.location set to '${settings.PQTestLocation}' but directory does not exist.`,
        );
        return undefined;
    }

    const pqtestExe: string = path.resolve(settings.PQTestLocation, "pqtest.exe");
    if (!fs.existsSync(pqtestExe)) {
        getOutputChannel().appendLine(`pqtest.exe not found at ${pqtestExe}`);
        return undefined;
    }

    return pqtestExe;
}

function getTaskForTaskDefinition(taskDef: PQTestTaskDefinition, pqtestExe: string): vscode.Task {
    const args: string[] = [taskDef.operation, ...CommonArgs];

    if (taskDef.additionalArgs) {
        args.push(...taskDef.additionalArgs);
    }

    if (taskDef.pathToConnector) {
        args.push("--extension");
        args.push(taskDef.pathToConnector);
    }

    if (taskDef.pathToQueryFile) {
        args.push("--queryFile");
        args.push(taskDef.pathToQueryFile);
    }

    const processExecution: vscode.ProcessExecution = new vscode.ProcessExecution(pqtestExe, args);

    // TODO: Include problem matcher
    return new vscode.Task(
        taskDef,
        vscode.TaskScope.Workspace,
        taskDef.label ?? taskDef.operation,
        TaskSource,
        processExecution,
        [] /* problemMatchers */,
    );
}

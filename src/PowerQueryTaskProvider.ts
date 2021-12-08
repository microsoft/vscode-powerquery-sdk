// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { ExtensionSettings } from "./ExtensionSettings";
import {
    ConnectorTaskDefinition,
    PowerQueryTaskProviderName,
    PQTestTaskDefinition,
    SimpleTaskDefinition,
} from "./PQTestTaskDefinition";

const CommonArgs: string[] = ["--prettyPrint"];
const TaskSource: string = "pqtest";

let _channel: vscode.OutputChannel;
function getOutputChannel(): vscode.OutputChannel {
    if (!_channel) {
        _channel = vscode.window.createOutputChannel("Power Query SDK");
    }
    return _channel;
}

export class PowerQueryTaskProvider implements vscode.TaskProvider {
    static TaskType: string = PowerQueryTaskProviderName;

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
    new SimpleTaskDefinition("list-credential", "List Credentials"),
    new SimpleTaskDefinition("delete-credential", "Clear All Credentials", ["--ALL"]),
    new ConnectorTaskDefinition("info", "Display Connector Info"),
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

    if (taskDef.includePathToConnector) {
        args.push("--extension");

        // TODO: Can we prompt for this if not already set?
        const extensionPath: string = taskDef.pathToConnector ?? "${config:pathToMez}";
        args.push(extensionPath);
    }

    if (taskDef.includePathToQueryFile) {
        args.push("--queryFile");

        // TODO: Can we prompt for this if not already set?
        const queryFilePath: string = taskDef.pathToQueryFile ?? "";
        args.push(queryFilePath);
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

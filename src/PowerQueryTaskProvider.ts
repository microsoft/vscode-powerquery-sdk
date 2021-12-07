// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { ExtensionSettings } from "./ExtensionSettings";

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
    static TestType = "powerquery";

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

// Properties that need to be persisted as part of the task definition should be
// included in the taskDefinitions section of package.json.
interface PQTestTaskDefinition extends vscode.TaskDefinition {
    readonly operation: string;
    readonly additionalArgs?: string[];
    readonly label?: string;
}

// TODO: Figure out where/how to define this in an extensible way
const pqTestOperations: PQTestTaskDefinition[] = [
    { type: PowerQueryTaskProvider.TestType, operation: "list-credential", label: "List Credentials" },
    {
        type: PowerQueryTaskProvider.TestType,
        operation: "delete-credential",
        additionalArgs: ["--ALL"],
        label: "Clear All Credentials",
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

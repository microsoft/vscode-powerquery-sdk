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

    private readonly fetchExtensionSettings: () => ExtensionSettings;

    constructor(fetchSettings: () => ExtensionSettings) {
        this.fetchExtensionSettings = fetchSettings;
    }

    public provideTasks(token: vscode.CancellationToken): vscode.ProviderResult<vscode.Task[]> {
        return getPQTestTasks(this.fetchExtensionSettings(), token);
    }

    public resolveTask(_task: vscode.Task, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.Task> {
        // TODO: implement!
        return undefined;
    }
}

interface PQTestTaskDefinition extends vscode.TaskDefinition {
    operation: string;
}

async function getPQTestTasks(settings: ExtensionSettings, _token: vscode.CancellationToken): Promise<vscode.Task[]> {
    const result: vscode.Task[] = [];

    const taskDef: PQTestTaskDefinition = {
        type: PowerQueryTaskProvider.TestType,
        operation: "list-credential",
    };

    if (!settings?.PQTestLocation) {
        getOutputChannel().appendLine("powerquery.sdk.pqtest.location configuration value is not set.");
        return result;
    }

    if (!fs.existsSync(settings.PQTestLocation)) {
        getOutputChannel().appendLine(
            `powerquery.sdk.pqtest.location set to '${settings.PQTestLocation}' but directory does not exist.`,
        );
        return result;
    }

    const pqtestExe: string = path.resolve(settings.PQTestLocation, "pqtest.exe");
    if (!fs.existsSync(pqtestExe)) {
        getOutputChannel().appendLine(`pqtest.exe not found at ${pqtestExe}`);
        return result;
    }

    const processExecution: vscode.ProcessExecution = new vscode.ProcessExecution(pqtestExe, [
        taskDef.operation,
        ...CommonArgs,
    ]);

    // TODO: Include problem matcher
    const task: vscode.Task = new vscode.Task(
        taskDef,
        vscode.TaskScope.Workspace,
        taskDef.operation,
        TaskSource,
        processExecution,
    );

    result.push(task);

    return result;
}

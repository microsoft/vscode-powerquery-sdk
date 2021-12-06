// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { ExtensionSettings } from "./ExtensionSettings";

const TaskSource: string = "pqtest";

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
    taskName: string;
}

async function getPQTestTasks(settings: ExtensionSettings, _token: vscode.CancellationToken): Promise<vscode.Task[]> {
    const result: vscode.Task[] = [];

    const taskDef: PQTestTaskDefinition = {
        type: PowerQueryTaskProvider.TestType,
        taskName: "list-credential",
    };

    // TODO: Who validates the path for PQTest location?
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    if (!settings?.PQTestLocation || !fs.existsSync(settings.PQTestLocation)) {
        return result;
    }

    const pqtestExe: string = path.resolve(settings.PQTestLocation, "pqtest.exe");

    const processExecution: vscode.ProcessExecution = new vscode.ProcessExecution(pqtestExe, ["list-credential", "-p"]);

    // TODO: Include problem matcher
    const task: vscode.Task = new vscode.Task(
        taskDef,
        vscode.TaskScope.Workspace,
        taskDef.taskName,
        TaskSource,
        processExecution,
    );

    result.push(task);

    return result;
}

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as vscode from "vscode";
import { buildPqTestArgs, IPQTestService, PQTestTaskDefinition } from "common/PQTestService";
import { ExtensionConstants } from "constants/PowerQuerySdkExtension";

const TaskSource: string = "pqtest";

const pqTestOperations: PQTestTaskDefinition[] = [
    { type: ExtensionConstants.PQTestTaskType, operation: "list-credential", label: "List credentials" },
    // TODO: Can we prompt to confirm that user really wants to remove all credentials?
    {
        type: ExtensionConstants.PQTestTaskType,
        operation: "delete-credential",
        label: "Clear ALL credentials",
        additionalArgs: ["--ALL"],
    },
    {
        type: ExtensionConstants.PQTestTaskType,
        operation: "info",
        label: "Connector info",
        pathToConnector: ExtensionConstants.ConfigPathToConnector,
    },
    // TODO: We need logic to determine which authentication kind to use (when there is more than one)
    {
        type: ExtensionConstants.PQTestTaskType,
        operation: "set-credential",
        label: "Set credential",
        additionalArgs: ["--interactive"],
        pathToConnector: ExtensionConstants.ConfigPathToConnector,
        pathToQueryFile: ExtensionConstants.ConfigPathToTestConnectionFile,
    },
    // TODO: This one should only be included for connectors with OAuth and Aad
    {
        type: ExtensionConstants.PQTestTaskType,
        operation: "refresh-credential",
        label: "Refresh credential",
        pathToConnector: ExtensionConstants.ConfigPathToConnector,
        pathToQueryFile: ExtensionConstants.ConfigPathToTestConnectionFile,
    },
    // TODO: How can we format the output?
    {
        type: ExtensionConstants.PQTestTaskType,
        operation: "run-test",
        label: "Evaluate current file",
        pathToConnector: ExtensionConstants.ConfigPathToConnector,
        pathToQueryFile: "${file}",
    },
    {
        type: ExtensionConstants.PQTestTaskType,
        operation: "test-connection",
        label: "Test connection",
        pathToConnector: ExtensionConstants.ConfigPathToConnector,
        pathToQueryFile: ExtensionConstants.ConfigPathToTestConnectionFile,
    },
];

export class PowerQueryTaskProvider implements vscode.TaskProvider {
    static TaskType: string = ExtensionConstants.PQTestTaskType;

    constructor(protected readonly pqTestService: IPQTestService) {}

    // todo getTaskForTaskDefinition can be static
    private getTaskForTaskDefinition(taskDef: PQTestTaskDefinition, pqtestExe: string): vscode.Task {
        const args: string[] = buildPqTestArgs(taskDef);
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

    public provideTasks(_token: vscode.CancellationToken): vscode.ProviderResult<vscode.Task[]> {
        const result: vscode.Task[] = [];

        if (!this.pqTestService.pqTestReady) {
            return result;
        }

        pqTestOperations.forEach((taskDef: PQTestTaskDefinition) => {
            result.push(this.getTaskForTaskDefinition(taskDef, this.pqTestService.pqTestFullPath));
        });

        return result;
    }

    public resolveTask(task: vscode.Task, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Task> {
        const pqtestExe: string = this.pqTestService.pqTestFullPath;

        if (pqtestExe && !token.isCancellationRequested) {
            const taskDef: PQTestTaskDefinition = task.definition as PQTestTaskDefinition;

            return this.getTaskForTaskDefinition(taskDef, pqtestExe);
        }

        return undefined;
    }
}

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as vscode from "vscode";
import { buildPqTestArgs, IPQTestService } from "common/PQTestService";
import { ExtensionConstants } from "constants/PowerQuerySdkExtension";
import { PowerQueryTaskDefinition } from "common/PowerQueryTask";

const enum TaskLabelPrefix {
    Build = "build",
    PQTest = "pqtest",
}

const pqTestOperations: PowerQueryTaskDefinition[] = [
    { type: ExtensionConstants.PowerQueryTaskType, operation: "list-credential", label: "List credentials" },
    // TODO: Can we prompt to confirm that user really wants to remove all credentials?
    {
        type: ExtensionConstants.PowerQueryTaskType,
        operation: "delete-credential",
        label: "Clear ALL credentials",
        additionalArgs: ["--ALL"],
    },
    {
        type: ExtensionConstants.PowerQueryTaskType,
        operation: "info",
        label: "Connector info",
        pathToConnector: ExtensionConstants.ConfigPathToConnector,
    },
    // TODO: We need logic to determine which authentication kind to use (when there is more than one)
    {
        type: ExtensionConstants.PowerQueryTaskType,
        operation: "set-credential",
        label: "Set credential",
        additionalArgs: ["--interactive"],
        pathToConnector: ExtensionConstants.ConfigPathToConnector,
        pathToQueryFile: ExtensionConstants.ConfigPathToTestConnectionFile,
    },
    // TODO: This one should only be included for connectors with OAuth and Aad
    {
        type: ExtensionConstants.PowerQueryTaskType,
        operation: "refresh-credential",
        label: "Refresh credential",
        pathToConnector: ExtensionConstants.ConfigPathToConnector,
        pathToQueryFile: ExtensionConstants.ConfigPathToTestConnectionFile,
    },
    // TODO: How can we format the output?
    {
        type: ExtensionConstants.PowerQueryTaskType,
        operation: "run-test",
        label: "Evaluate current file",
        pathToConnector: ExtensionConstants.ConfigPathToConnector,
        pathToQueryFile: "${file}",
    },
    {
        type: ExtensionConstants.PowerQueryTaskType,
        operation: "test-connection",
        label: "Test connection",
        pathToConnector: ExtensionConstants.ConfigPathToConnector,
        pathToQueryFile: ExtensionConstants.ConfigPathToTestConnectionFile,
    },
];

const buildTasks: PowerQueryTaskDefinition[] = [
    {
        type: ExtensionConstants.PowerQueryTaskType,
        operation: "msbuild",
        label: "Build connector project using MSBuild",
        additionalArgs: ["/restore", "/consoleloggerparameters:NoSummary", "/property:GenerateFullPaths=true"],
    },
];

export class PowerQueryTaskProvider implements vscode.TaskProvider {
    static TaskType: string = ExtensionConstants.PowerQueryTaskType;

    constructor(protected readonly pqTestService: IPQTestService) {}

    public provideTasks(_token: vscode.CancellationToken): vscode.ProviderResult<vscode.Task[]> {
        const result: vscode.Task[] = [];

        buildTasks.forEach((taskDef: PowerQueryTaskDefinition) => {
            result.push(PowerQueryTaskProvider.getTaskForBuildTaskDefinition(taskDef));
        });

        if (!this.pqTestService.pqTestReady) {
            return result;
        }

        pqTestOperations.forEach((taskDef: PowerQueryTaskDefinition) => {
            result.push(
                PowerQueryTaskProvider.getTaskForPQTestTaskDefinition(taskDef, this.pqTestService.pqTestFullPath),
            );
        });

        return result;
    }

    public resolveTask(task: vscode.Task, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Task> {
        const taskDef: PowerQueryTaskDefinition = task.definition as PowerQueryTaskDefinition;

        if (taskDef.operation === "msbuild") {
            return PowerQueryTaskProvider.getTaskForBuildTaskDefinition(taskDef);
        }

        const pqtestExe: string = this.pqTestService.pqTestFullPath;

        if (pqtestExe && !token.isCancellationRequested) {
            return PowerQueryTaskProvider.getTaskForPQTestTaskDefinition(taskDef, pqtestExe);
        }

        return undefined;
    }

    private static getTaskForPQTestTaskDefinition(taskDef: PowerQueryTaskDefinition, pqtestExe: string): vscode.Task {
        const args: string[] = buildPqTestArgs(taskDef);
        const processExecution: vscode.ProcessExecution = new vscode.ProcessExecution(pqtestExe, args);

        // TODO: Include problem matcher
        return new vscode.Task(
            taskDef,
            vscode.TaskScope.Workspace,
            taskDef.label ?? taskDef.operation,
            TaskLabelPrefix.PQTest,
            processExecution,
            [] /* problemMatchers */,
        );
    }

    private static getTaskForBuildTaskDefinition(taskDef: PowerQueryTaskDefinition): vscode.Task {
        // TODO: To support SDK based build we'll need to:
        // - Check the kind on the taskDef
        // - Change ShellExecution to CustomExecution
        // - Update the problem matcher
        const execution: vscode.ShellExecution = new vscode.ShellExecution("msbuild");

        if (taskDef.additionalArgs && taskDef.additionalArgs.length > 0) {
            execution.args.push(...taskDef.additionalArgs);
        }

        const task: vscode.Task = new vscode.Task(
            taskDef,
            vscode.TaskScope.Workspace,
            taskDef.label ?? taskDef.operation,
            TaskLabelPrefix.Build,
            execution,
            ["$msCompile"],
        );

        task.group = vscode.TaskGroup.Build;

        task.presentationOptions = {
            reveal: vscode.TaskRevealKind.Silent,
        };

        return task;
    }
}

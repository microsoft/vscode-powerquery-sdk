/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as path from "path";
import * as vscode from "vscode";

import { buildPqTestArgs, IPQTestService } from "common/PQTestService";
import { ExtensionConstants } from "constants/PowerQuerySdkExtension";
import { getFirstWorkspaceFolder } from "../utils/vscodes";
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
    // {
    //     type: ExtensionConstants.PowerQueryTaskType,
    //     operation: "msbuild",
    //     label: "Build connector project using MSBuild",
    //     additionalArgs: ["/restore", "/consoleloggerparameters:NoSummary", "/property:GenerateFullPaths=true"],
    // },
    {
        type: ExtensionConstants.PowerQueryTaskType,
        operation: "compile",
        label: "Build connector project using MakePQX",
        additionalArgs: [],
    },
];

export class PowerQueryTaskProvider implements vscode.TaskProvider {
    static TaskType: string = ExtensionConstants.PowerQueryTaskType;

    constructor(protected readonly pqTestService: IPQTestService) {}

    public provideTasks(_token: vscode.CancellationToken): vscode.ProviderResult<vscode.Task[]> {
        const result: vscode.Task[] = [];

        if (!this.pqTestService.pqTestReady) {
            return result;
        }

        buildTasks.forEach((taskDef: PowerQueryTaskDefinition) => {
            result.push(
                PowerQueryTaskProvider.getTaskForPQTestTaskDefinition(
                    taskDef,
                    path.join(this.pqTestService.pqTestLocation, ExtensionConstants.MakePQXExecutableName),
                ),
            );
        });

        pqTestOperations.forEach((taskDef: PowerQueryTaskDefinition) => {
            result.push(
                PowerQueryTaskProvider.getTaskForPQTestTaskDefinition(taskDef, this.pqTestService.pqTestFullPath),
            );
        });

        return result;
    }

    public resolveTask(task: vscode.Task, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Task> {
        const taskDef: PowerQueryTaskDefinition = task.definition as PowerQueryTaskDefinition;

        const pqtestExe: string = this.pqTestService.pqTestFullPath;

        if (taskDef.operation === "compile") {
            const currentWorkingFolder: string | undefined = getFirstWorkspaceFolder()?.uri.fsPath;

            const makePQXExe: string = path.join(
                this.pqTestService.pqTestLocation,
                ExtensionConstants.MakePQXExecutableName,
            );

            if (currentWorkingFolder && this.pqTestService.pqTestLocation && !token.isCancellationRequested) {
                const args: string[] = buildPqTestArgs(taskDef);
                args.push(currentWorkingFolder);
                const processExecution: vscode.ProcessExecution = new vscode.ProcessExecution(makePQXExe, args);

                return new vscode.Task(
                    taskDef,
                    vscode.TaskScope.Workspace,
                    taskDef.label ?? taskDef.operation,
                    TaskLabelPrefix.Build,
                    processExecution,
                    [] /* problemMatchers */,
                );
            }

            return undefined;
        }

        if (pqtestExe && !token.isCancellationRequested) {
            return PowerQueryTaskProvider.getTaskForPQTestTaskDefinition(taskDef, pqtestExe);
        }

        return undefined;
    }

    private static getTaskForPQTestTaskDefinition(
        taskDef: PowerQueryTaskDefinition,
        executablePath: string,
    ): vscode.Task {
        const args: string[] = buildPqTestArgs(taskDef);
        const processExecution: vscode.ProcessExecution = new vscode.ProcessExecution(executablePath, args);

        // TODO: Include problem matcher
        const vscTask: vscode.Task = new vscode.Task(
            taskDef,
            vscode.TaskScope.Workspace,
            taskDef.label ?? taskDef.operation,
            taskDef.operation === "compile" ? TaskLabelPrefix.Build : TaskLabelPrefix.PQTest,
            processExecution,
            [] /* no problemMatchers */,
        );

        if (taskDef.operation === "compile") {
            vscTask.group = vscode.TaskGroup.Build;
        }

        return vscTask;
    }

    // private static getTaskForBuildTaskDefinition(
    // taskDef: PowerQueryTaskDefinition, msbuildExe: string): vscode.Task {
    //     // TODO: To support SDK based build we'll need to:
    //     // - Check the kind on the taskDef
    //     // - Change ShellExecution to CustomExecution
    //     // - Update the problem matcher
    //     const execution: vscode.ProcessExecution = new vscode.ProcessExecution(msbuildExe);
    //
    //     if (taskDef.additionalArgs && taskDef.additionalArgs.length > 0) {
    //         execution.args.push(...taskDef.additionalArgs);
    //     }
    //
    //     const task: vscode.Task = new vscode.Task(
    //         taskDef,
    //         vscode.TaskScope.Workspace,
    //         taskDef.label ?? taskDef.operation,
    //         TaskLabelPrefix.Build,
    //         execution,
    //         ["$msCompile"],
    //     );
    //
    //     task.group = vscode.TaskGroup.Build;
    //
    //     task.presentationOptions = {
    //         reveal: vscode.TaskRevealKind.Silent,
    //     };
    //
    //     return task;
    // }
}

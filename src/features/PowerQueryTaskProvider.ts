/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as path from "path";
import * as vscode from "vscode";

import { buildPqTestArgs, IPQTestService } from "../common/PQTestService";
import { ExtensionConfigurations } from "../constants/PowerQuerySdkConfiguration";
import { ExtensionConstants } from "../constants/PowerQuerySdkExtension";
import { extensionI18n } from "../i18n/extension";
import { getFirstWorkspaceFolder } from "../utils/vscodes";
import { PowerQueryTaskDefinition } from "../common/PowerQueryTask";
import { PqSdkTaskTerminal } from "./PqSdkTaskTerminal";

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
        label: extensionI18n["PQSdk.lifecycleTreeView.item.deleteAllCredentials.title"],
        additionalArgs: ["--ALL"],
    },
    {
        type: ExtensionConstants.PowerQueryTaskType,
        operation: "info",
        label: extensionI18n["PQSdk.lifecycleTreeView.item.displayExtensionInfo.title"],
        pathToConnector: ExtensionConstants.ConfigPathToConnector,
    },
    // TODO: We need logic to determine which authentication kind to use (when there is more than one)
    {
        type: ExtensionConstants.PowerQueryTaskType,
        operation: "set-credential",
        label: extensionI18n["PQSdk.lifecycleTreeView.item.createOneCredential.title"],
        additionalArgs: ["--interactive"],
        pathToConnector: ExtensionConstants.ConfigPathToConnector,
        pathToQueryFile: ExtensionConstants.ConfigPathToTestConnectionFile,
    },
    // TODO: This one should only be included for connectors with OAuth and Aad
    {
        type: ExtensionConstants.PowerQueryTaskType,
        operation: "refresh-credential",
        label: extensionI18n["PQSdk.lifecycleTreeView.item.refreshCredentials.title"],
        pathToConnector: ExtensionConstants.ConfigPathToConnector,
        pathToQueryFile: ExtensionConstants.ConfigPathToTestConnectionFile,
    },
    // TODO: How can we format the output?
    {
        type: ExtensionConstants.PowerQueryTaskType,
        operation: "run-test",
        label: extensionI18n["PQSdk.lifecycleTreeView.item.evaluateOpenedFile.title"],
        pathToConnector: ExtensionConstants.ConfigPathToConnector,
        pathToQueryFile: "${file}",
    },
    {
        type: ExtensionConstants.PowerQueryTaskType,
        operation: "test-connection",
        label: extensionI18n["PQSdk.lifecycleTreeView.item.testConnection.title"],
        pathToConnector: ExtensionConstants.ConfigPathToConnector,
        pathToQueryFile: ExtensionConstants.ConfigPathToTestConnectionFile,
    },
];

const msbuildTaskDefinition: PowerQueryTaskDefinition = {
    type: ExtensionConstants.PowerQueryTaskType,
    operation: "msbuild",
    label: "Build connector project using MSBuild",
    additionalArgs: ["/restore", "/consoleloggerparameters:NoSummary", "/property:GenerateFullPaths=true"],
};

const makePQXCompileTaskDefinition: PowerQueryTaskDefinition = {
    type: ExtensionConstants.PowerQueryTaskType,
    operation: "compile",
    label: extensionI18n["PQSdk.taskProvider.makePQx.compile.label"],
    additionalArgs: [],
};

interface PendingTaskResolver {
    resolve: (execution: vscode.TaskExecution) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reject: (reason: any) => void;
}

export class PowerQueryTaskProvider implements vscode.TaskProvider {
    private static pendingTaskMap: WeakMap<vscode.Task, PendingTaskResolver> = new WeakMap();

    public static TaskType: string = ExtensionConstants.PowerQueryTaskType;
    // the ExtensionConfigurations.msbuildPath might change during the runtime,
    // thus we also have to build the task during the runtime
    public static buildMsbuildTask(): vscode.Task {
        return this.getTaskForBuildTaskDefinition(
            msbuildTaskDefinition,
            ExtensionConfigurations.msbuildPath || "msbuild",
        );
    }
    // the pqTestLocation might change during the runtime,
    // thus we also have to build the task during the runtime
    public static buildMakePQXCompileTask(pqTestLocation: string): vscode.Task {
        return this.getTaskForPQTestTaskDefinition(
            makePQXCompileTaskDefinition,
            path.join(pqTestLocation, ExtensionConstants.MakePQXExecutableName),
        );
    }

    public static executeTask(task: vscode.Task): Promise<vscode.TaskExecution> {
        void vscode.tasks.executeTask(task);

        return new Promise<vscode.TaskExecution>(
            (resolve: PendingTaskResolver["resolve"], reject: PendingTaskResolver["reject"]) => {
                this.pendingTaskMap.set(task, { resolve, reject });
            },
        );
    }

    public static ActivateModule(): void {
        vscode.tasks.onDidEndTask((event: vscode.TaskEndEvent) => {
            const theTask: vscode.Task = event.execution.task;

            const maybePendingTaskResolver: PendingTaskResolver | undefined =
                PowerQueryTaskProvider.pendingTaskMap.get(theTask);

            if (maybePendingTaskResolver) {
                maybePendingTaskResolver.resolve(event.execution);
                PowerQueryTaskProvider.pendingTaskMap.delete(theTask);
            }
        });
    }

    constructor(protected readonly pqTestService: IPQTestService) {
        // noop
    }

    public provideTasks(_token: vscode.CancellationToken): vscode.ProviderResult<vscode.Task[]> {
        const result: vscode.Task[] = [];

        if (!this.pqTestService.pqTestReady) {
            return result;
        }

        result.push(PowerQueryTaskProvider.buildMsbuildTask());
        result.push(PowerQueryTaskProvider.buildMakePQXCompileTask(this.pqTestService.pqTestLocation));

        const useServiceHost: boolean = ExtensionConfigurations.featureUseServiceHost;

        if (useServiceHost) {
            pqTestOperations.forEach((taskDef: PowerQueryTaskDefinition) => {
                result.push(PqSdkTaskTerminal.getTaskForPQTestTaskDefinition(taskDef));
            });
        } else {
            pqTestOperations.forEach((taskDef: PowerQueryTaskDefinition) => {
                result.push(
                    PowerQueryTaskProvider.getTaskForPQTestTaskDefinition(taskDef, this.pqTestService.pqTestFullPath),
                );
            });
        }

        return result;
    }

    public resolveTask(task: vscode.Task, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Task> {
        const taskDef: PowerQueryTaskDefinition = task.definition as PowerQueryTaskDefinition;

        const pqtestExe: string = this.pqTestService.pqTestFullPath;

        if (taskDef.operation === "msbuild") {
            const msbuildFullPath: string | undefined = ExtensionConfigurations.msbuildPath;

            if (msbuildFullPath && !token.isCancellationRequested) {
                return PowerQueryTaskProvider.getTaskForBuildTaskDefinition(taskDef, msbuildFullPath);
            }

            return undefined;
        }

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

        const useServiceHost: boolean = ExtensionConfigurations.featureUseServiceHost;

        if (useServiceHost) {
            return PqSdkTaskTerminal.getTaskForPQTestTaskDefinition(taskDef);
        } else if (pqtestExe && !token.isCancellationRequested) {
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

    private static getTaskForBuildTaskDefinition(taskDef: PowerQueryTaskDefinition, msbuildExe: string): vscode.Task {
        // TODO: To support SDK based build we'll need to:
        // - Check the kind on the taskDef
        // - Change ShellExecution to CustomExecution
        // - Update the problem matcher
        const execution: vscode.ProcessExecution = new vscode.ProcessExecution(msbuildExe);

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
// activate the PowerQueryTaskProvider module to subscribe vsc tasks
PowerQueryTaskProvider.ActivateModule();

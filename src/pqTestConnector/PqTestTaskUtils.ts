/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import fs from "fs";
import path from "path";
import vscode from "vscode";

import { ExtensionConfigurations } from "../constants/PowerQuerySdkConfiguration";
import { PowerQueryTaskProvider } from "../features/PowerQueryTaskProvider";
import { findExecutable } from "../utils/executables";
import { getMtimeOfAFile, globFiles } from "../utils/files";
import { getAnyMProjFilesBeneathTheFirstWorkspace, getFirstWorkspaceFolder } from "../utils/vscodes";

export async function executeBuildTaskAndAwaitIfNeeded(
    pqTestLocation: string,
    lastPqRelatedFileTouchedDate: Date = new Date(),
    lastPqRelatedFileTouchedDateUpdater: (nextLastPqRelatedFileTouchedDate: Date) => void = () => {},
): Promise<void> {
    const nullableCurrentWorkspace: string | undefined = getFirstWorkspaceFolder()?.uri.fsPath;
    let needToRebuildBeforeEvaluation: boolean = true;

    if (nullableCurrentWorkspace) {
        const currentlyAllMezFiles: string[] = [];

        for await (const oneFullPath of globFiles(path.join(nullableCurrentWorkspace, "bin"), (fullPath: string) =>
            fullPath.endsWith(".mez"),
        )) {
            currentlyAllMezFiles.push(oneFullPath);
        }

        if (currentlyAllMezFiles.length === 1) {
            const theMtimeOfTheFile: Date = getMtimeOfAFile(currentlyAllMezFiles[0]);
            needToRebuildBeforeEvaluation = theMtimeOfTheFile <= lastPqRelatedFileTouchedDate;
        } else {
            needToRebuildBeforeEvaluation = true;
        }

        if (needToRebuildBeforeEvaluation) {
            // only remove existing mez file if there were more than one
            // if (currentlyAllMezFiles.length > 1) {
            currentlyAllMezFiles.forEach((oneMezFileFullPath: string) => {
                fs.unlinkSync(oneMezFileFullPath);
            });
            // }

            // choose msbuild or makePQX compile as the build task
            let theBuildTask: vscode.Task = PowerQueryTaskProvider.buildMakePQXCompileTask(pqTestLocation);

            // check if we had any legacy *.mproj or .proj beneath the first directory
            const anyMProjFilesFromLegacyProjects: vscode.Uri[] = await getAnyMProjFilesBeneathTheFirstWorkspace();

            if (
                anyMProjFilesFromLegacyProjects.length &&
                (ExtensionConfigurations.msbuildPath || findExecutable("msbuild", [".exe", ""]))
            ) {
                // only use msbuild when we had either config:msbuild populated or msbuild existing in the env:path
                // also we got legacy proj/mproj files in the workspace
                theBuildTask = PowerQueryTaskProvider.buildMsbuildTask();
            }

            // we should set lastPqRelatedFileTouchedDate first to ensure it is less than the new build's ctime
            lastPqRelatedFileTouchedDateUpdater(new Date());

            await PowerQueryTaskProvider.executeTask(theBuildTask);
        }
    }
}

export function inferAnyGeneralErrorString(resultJson: unknown): string {
    if (Array.isArray(resultJson)) {
        for (const item of resultJson) {
            const message: string = inferAnyGeneralErrorString(item);

            if (message) {
                return message;
            }
        }

        return "";
    }

    if (resultJson && typeof resultJson === "object") {
        if ("ErrorStatus" in resultJson && typeof resultJson.ErrorStatus === "string" && resultJson.ErrorStatus) {
            return resultJson.ErrorStatus;
        }

        if ("Status" in resultJson && (resultJson.Status === "Failure" || resultJson.Status === "Failed")) {
            if ("Message" in resultJson && typeof resultJson.Message === "string" && resultJson.Message) {
                return resultJson.Message;
            }

            if (
                "Error" in resultJson &&
                resultJson.Error &&
                typeof resultJson.Error === "object" &&
                "Message" in resultJson.Error &&
                typeof resultJson.Error.Message === "string" &&
                resultJson.Error.Message
            ) {
                return resultJson.Error.Message;
            }

            return "Details" in resultJson && typeof resultJson.Details === "string" && resultJson.Details
                ? resultJson.Details
                : JSON.stringify(resultJson);
        }
    }

    return "";
}

export function formatArguments(args: string[]): string {
    let result: string = "";

    let isLastArgParameter: boolean = false;

    for (const oneArg of args) {
        // pre formatting
        const isCurrentArgumentParameter: boolean = oneArg.indexOf("--") === 0 || oneArg.indexOf("-") === 0;

        const shouldQuoted: boolean = isLastArgParameter && !isCurrentArgumentParameter;
        const shouldBreakLine: boolean = isCurrentArgumentParameter;

        // formatting
        let oneArgStr: string = oneArg;

        if (shouldQuoted) {
            oneArgStr = `"${oneArgStr}"`;
        }

        // append
        if (shouldBreakLine) {
            result += "\r\n\t\t\t\t";
        } else if (result.length) {
            result += " ";
        }

        result += oneArgStr;

        // post formatting
        isLastArgParameter = isCurrentArgumentParameter;
    }

    return result;
}

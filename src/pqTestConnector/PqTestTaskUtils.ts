/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import fs from "fs";
import path from "path";
import vscode from "vscode";

import { getAnyMProjFilesBeneathTheFirstWorkspace, getFirstWorkspaceFolder } from "../utils/vscodes";
import { getCtimeOfAFile, globFiles } from "../utils/files";
import { ExtensionConfigurations } from "../constants/PowerQuerySdkConfiguration";
import { findExecutable } from "../utils/executables";
import { PowerQueryTaskProvider } from "../features/PowerQueryTaskProvider";

export async function executeBuildTaskAndAwaitIfNeeded(
    pqTestLocation: string,
    lastPqRelatedFileTouchedDate: Date,
    lastPqRelatedFileTouchedDateUpdater: (nextLastPqRelatedFileTouchedDate: Date) => void,
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
            const theCtimeOfTheFile: Date = getCtimeOfAFile(currentlyAllMezFiles[0]);
            needToRebuildBeforeEvaluation = theCtimeOfTheFile <= lastPqRelatedFileTouchedDate;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function inferAnyGeneralErrorString(resultJson: any): string {
    let result: string = "";

    if (Array.isArray(resultJson)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resultJson.some((one: any) => {
            if (typeof one["ErrorStatus"] === "string" && one["ErrorStatus"]) {
                result = one["ErrorStatus"];

                return true;
            }

            return false;
        });
    } else if (typeof resultJson["ErrorStatus"] === "string" && resultJson["ErrorStatus"]) {
        result = resultJson["ErrorStatus"];
    }

    return result;
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

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

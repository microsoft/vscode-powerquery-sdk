/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as chai from "chai";
import * as fs from "fs";
import * as path from "path";
import * as process from "process";
import * as vscode from "vscode";

import { ExtensionConstants } from "../../constants/PowerQuerySdkExtension";

import { NugetVersions } from "../../utils/NugetVersions";
import { SpawnedProcess } from "../../common/SpawnedProcess";

import {
    buildPqTestSubPath,
    extensionDevelopmentPath,
    NugetBaseFolder,
    NugetConfigFileName,
    PqTestSubPath,
} from "./common";
import { delay } from "./utils";

const expect = chai.expect;

const MAX_AWAIT_TIME: number = 2 * 60e3;
const AWAIT_INTERVAL: number = 5e3;

async function doListPqTestFromNuget(): Promise<string> {
    // nuget list Microsoft.PowerQuery.SdkTools -ConfigFile ./etc/nuget-staging.config
    const baseNugetFolder: string = path.resolve(extensionDevelopmentPath, NugetBaseFolder);

    if (!fs.existsSync(baseNugetFolder)) {
        fs.mkdirSync(baseNugetFolder);
    }

    const args: string[] = [
        "list",
        ExtensionConstants.InternalMsftPqSdkToolsNugetName,
        "-ConfigFile",
        path.resolve(extensionDevelopmentPath, "etc", NugetConfigFileName),
    ];

    const seizingProcess: SpawnedProcess = new SpawnedProcess("nuget", args, {
        cwd: baseNugetFolder,
        env: {
            ...process.env,
            FORCE_NUGET_EXE_INTERACTIVE: "true",
        },
    });

    await seizingProcess.deferred$;

    return seizingProcess.stdOut;
}

async function getLatestNugetVersion(): Promise<string | undefined> {
    const latestVersion: NugetVersions = NugetVersions.createFromNugetListOutput(await doListPqTestFromNuget());

    return latestVersion.toString();
}

function getExpectedPqTestPath(maybeNextVersion?: string): string | undefined {
    const baseNugetFolder: string = path.resolve(extensionDevelopmentPath, NugetBaseFolder);

    const pqTestSubPath: string[] = maybeNextVersion ? buildPqTestSubPath(maybeNextVersion) : PqTestSubPath;

    return path.resolve(baseNugetFolder, ...pqTestSubPath);
}

export function buildPqTestAcquisitionTest(): void {
    test("Seize the pqTest from nuget", async () => {
        let i = 0;

        const mayBeExpectedPqTestExePath: string | undefined = getExpectedPqTestPath(await getLatestNugetVersion());

        expect(typeof mayBeExpectedPqTestExePath).eq("string");

        const expectedPqTestExePath: string = mayBeExpectedPqTestExePath as string;

        while (i < MAX_AWAIT_TIME / AWAIT_INTERVAL) {
            i += 1;
            // eslint-disable-next-line no-await-in-loop
            await delay(AWAIT_INTERVAL);

            if (fs.existsSync(expectedPqTestExePath)) {
                break;
            }
        }

        const manuallySeizedPath: string = await vscode.commands.executeCommand(
            "powerquery.sdk.pqtest.SeizePqTestCommand",
        );

        expect(manuallySeizedPath).eq(path.dirname(expectedPqTestExePath));
    }).timeout(MAX_AWAIT_TIME);
}

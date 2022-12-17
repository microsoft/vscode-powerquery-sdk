/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as path from "path";
import * as StreamZip from "node-stream-zip";

import { StreamZipAsync } from "node-stream-zip";

import { makeOneTmpDir } from "../../utils/osUtils";
import { NugetLiteHttpService } from "./NugetLiteHttpService";
import type { PqSdkOutputChannel } from "../../features/PqSdkOutputChannel"; // this pal got vscode modules imported
import { removeDirectoryRecursively } from "../../utils/files";

export class NugetHttpService extends NugetLiteHttpService {
    protected override errorHandler: (error: Error) => void = (error: Error) => {
        this.outputChannel?.appendErrorLine(`Failed to request to public nuget endpoints due to ${error}`);
    };
    constructor(private readonly outputChannel?: PqSdkOutputChannel) {
        super();
    }

    public override async downloadAndExtractNugetPackage(
        packageName: string,
        packageVersion: string,
        outputLocation: string,
    ): Promise<void> {
        this.outputChannel?.appendInfoLine(`Start to download ${packageName} ${packageVersion}`);
        const oneTmpDir: string = makeOneTmpDir();

        const targetFilePath: string = path.join(oneTmpDir, `${packageName}.${packageVersion}.zip`);
        await this.downloadNugetPackage(packageName, packageVersion, targetFilePath);

        const zip: StreamZipAsync = new StreamZip.async({ file: targetFilePath });
        await zip.extract(null, outputLocation);
        await zip.close();

        setTimeout(async () => {
            try {
                await removeDirectoryRecursively(oneTmpDir);
            } catch (e: unknown) {
                this.outputChannel?.appendErrorLine(`Cannot remove ${oneTmpDir} due to ${e}`);
            }
        }, 4e3);
    }
}

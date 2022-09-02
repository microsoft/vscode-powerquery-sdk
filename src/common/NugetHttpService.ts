/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as path from "path";
import * as stream from "stream";
import * as StreamZip from "node-stream-zip";

import { createWriteStream, WriteStream } from "fs";
import { promisify } from "util";
import { StreamZipAsync } from "node-stream-zip";

import axios, { AxiosInstance, AxiosResponse } from "axios";
import { makeOneTmpDir } from "../utils/osUtils";
import { removeDirectoryRecursively } from "../utils/files";

const streamFinished$deferred: (
    stream: NodeJS.ReadStream | NodeJS.WritableStream | NodeJS.ReadWriteStream,
    options?: stream.FinishedOptions | undefined,
) => Promise<void> = promisify(stream.finished);

export class NugetHttpService {
    // public static PreReleaseIncludedVersionRegex: RegExp = /^((?:\.?[0-9]+){3,}(?:[-a-z0-9]+)?)$/;
    // eslint-disable-next-line security/detect-unsafe-regex
    public static ReleasedVersionRegex: RegExp = /^((?:\.?[0-9]+){3,})$/;

    private instance: AxiosInstance;
    private errorHandler: (error: Error) => void = () => {
        // noop
    };
    constructor() {
        this.instance = axios.create({
            baseURL: "https://api.nuget.org",
            // todo populate the proxy settings over here
        });
    }

    public async getPackageVersions(packageName: string): Promise<{ versions: string[] }> {
        try {
            const response: AxiosResponse<{ versions: string[] }> = await this.instance.get(
                `v3-flatcontainer/${packageName.toLowerCase()}/index.json`,
            );

            return response.data;
        } catch (e: unknown) {
            this.errorHandler(e as Error);

            return { versions: [] };
        }
    }

    public async getPackageReleasedVersions(packageName: string): Promise<{ versions: string[] }> {
        const preReleasedVersionIncludeVersions: { versions: string[] } = await this.getPackageVersions(packageName);

        preReleasedVersionIncludeVersions.versions = preReleasedVersionIncludeVersions.versions.filter(
            (versionStr: string) => NugetHttpService.ReleasedVersionRegex.exec(versionStr),
        );

        return preReleasedVersionIncludeVersions;
    }

    public downloadNugetPackage(packageName: string, packageVersion: string, outputLocation: string): Promise<void> {
        const writer: WriteStream = createWriteStream(outputLocation);
        const packageNameInLowerCase: string = packageName.toLowerCase();

        return this.instance
            .get(
                `v3-flatcontainer/${packageNameInLowerCase}/${packageVersion}/${packageNameInLowerCase}.${packageVersion}.nupkg`,
                {
                    responseType: "stream",
                },
            )
            .then((response: AxiosResponse) => {
                response.data.pipe(writer);

                return streamFinished$deferred(writer);
            });
    }

    public async downloadAndExtractNugetPackage(
        packageName: string,
        packageVersion: string,
        outputLocation: string,
    ): Promise<void> {
        const oneTmpDir: string = makeOneTmpDir();

        const targetFilePath: string = path.join(oneTmpDir, `${packageName}.${packageVersion}.zip`);
        await this.downloadNugetPackage(packageName, packageVersion, targetFilePath);

        const zip: StreamZipAsync = new StreamZip.async({ file: targetFilePath });
        await zip.extract(null, outputLocation);
        await zip.close();

        await removeDirectoryRecursively(oneTmpDir);
    }
}

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
import { assertNotNull } from "../../utils/assertUtils";
import { makeOneTmpDir } from "../../utils/osUtils";
import { NugetVersions } from "../../utils/NugetVersions";
import { tryRemoveDirectoryRecursively } from "../../utils/files";

const streamFinished$deferred: (
    stream: NodeJS.ReadStream | NodeJS.WritableStream | NodeJS.ReadWriteStream,
    options?: stream.FinishedOptions | undefined,
) => Promise<void> = promisify(stream.finished);

/**
 * Format
 *  https: into https
 *  http: into http
 * @param urlProtocol
 */
function formatUrlProtocol(urlProtocol: string): string {
    if (urlProtocol.toLowerCase().indexOf("https") > -1) {
        return "https";
    } else if (urlProtocol.toLowerCase().indexOf("http") > -1) {
        return "http";
    } else {
        return urlProtocol;
    }
}

/**
 * NugetLiteHttpService is reserved for testing,
 * thus it cannot import any modules from 'vscode'
 */
export class NugetLiteHttpService {
    // public static PreReleaseIncludedVersionRegex: RegExp = /^((?:\.?[0-9]+){3,}(?:[-a-z0-9]+)?)$/;
    // eslint-disable-next-line security/detect-unsafe-regex
    public static ReleasedVersionRegex: RegExp = /^((?:\.?[0-9]+){3,})$/;
    public static DefaultBaseUrl: string = "https://api.nuget.org";

    protected instance: AxiosInstance = axios.create({
        baseURL: NugetLiteHttpService.DefaultBaseUrl,
    });
    protected errorHandler: (error: Error) => void = () => {
        // noop
    };
    constructor() {
        this.updateAxiosInstance();
    }

    public updateAxiosInstance(
        baseURL: string = NugetLiteHttpService.DefaultBaseUrl,
        nullableHttpProxy: string | undefined = undefined,
        nullableHttpProxyAuthHeaderString: string | undefined = undefined,
    ): void {
        if (nullableHttpProxy) {
            const proxyUrl: URL = new URL(nullableHttpProxy);

            this.instance = axios.create({
                baseURL,
                proxy: {
                    protocol: formatUrlProtocol(proxyUrl.protocol),
                    host: proxyUrl.hostname,
                    port: parseInt(proxyUrl.port, 10),
                },
            });

            if (nullableHttpProxyAuthHeaderString) {
                this.instance.defaults.headers.common["Authorization"] = nullableHttpProxyAuthHeaderString;
            }
        } else {
            this.instance = axios.create({
                baseURL,
            });
        }
    }

    public async getPackageVersions(packageName: string): Promise<{ versions: string[] }> {
        try {
            const response: AxiosResponse<{ versions: string[] }> = await this.instance.get(
                `v3-flatcontainer/${packageName.toLowerCase()}/index.json`,
            );

            return response.data;
        } catch (e: unknown) {
            this.errorHandler(e as Error);

            throw e;
        }
    }

    public async getPackageReleasedVersions(packageName: string): Promise<{ versions: string[] }> {
        const preReleasedVersionIncludeVersions: { versions: string[] } = await this.getPackageVersions(packageName);

        preReleasedVersionIncludeVersions.versions = preReleasedVersionIncludeVersions.versions.filter(
            (versionStr: string) => NugetLiteHttpService.ReleasedVersionRegex.exec(versionStr),
        );

        return preReleasedVersionIncludeVersions;
    }

    public async getSortedPackageReleasedVersions(
        packageName: string,
        options: {
            maximumNugetVersion?: NugetVersions;
            minimumNugetVersion?: NugetVersions;
        } = {},
    ): Promise<NugetVersions[]> {
        const preReleasedVersionIncludeVersions: { versions: string[] } = await this.getPackageReleasedVersions(
            packageName,
        );

        let sortedNugetVersions: NugetVersions[] = preReleasedVersionIncludeVersions.versions
            .map((releasedVersion: string) => NugetVersions.createFromReleasedVersionString(releasedVersion))
            .sort(NugetVersions.compare);

        if (options.maximumNugetVersion) {
            const maximumNugetVersion: NugetVersions = assertNotNull(options.maximumNugetVersion);

            // filter out any version gt maximumNugetVersion in sortedNugetVersions
            sortedNugetVersions = sortedNugetVersions.filter(
                (one: NugetVersions) => one.compare(maximumNugetVersion) <= 0,
            );
        }

        if (options.minimumNugetVersion) {
            const minimumNugetVersion: NugetVersions = assertNotNull(options.minimumNugetVersion);

            // filter out any version gt maximumNugetVersion in sortedNugetVersions
            sortedNugetVersions = sortedNugetVersions.filter(
                (one: NugetVersions) => minimumNugetVersion.compare(one) <= 0,
            );
        }

        return sortedNugetVersions;
    }

    public downloadNugetPackage(packageName: string, packageVersion: string, outputLocation: string): Promise<void> {
        const writer: WriteStream = createWriteStream(outputLocation);
        const packageNameInLowerCase: string = packageName.toLowerCase();

        try {
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
        } catch (e: unknown) {
            this.errorHandler(e as Error);

            throw e;
        }
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

        await tryRemoveDirectoryRecursively(oneTmpDir);
    }
}

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
import { GlobalEventBus, GlobalEvents } from "../GlobalEventBus";
import { debounce } from "../utils/debounce";
import { ExtensionConfigurations } from "../constants/PowerQuerySdkConfiguration";
import { makeOneTmpDir } from "../utils/osUtils";
import { PqSdkOutputChannel } from "../features/PqSdkOutputChannel";
import { removeDirectoryRecursively } from "../utils/files";

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

export class NugetHttpService {
    // public static PreReleaseIncludedVersionRegex: RegExp = /^((?:\.?[0-9]+){3,}(?:[-a-z0-9]+)?)$/;
    // eslint-disable-next-line security/detect-unsafe-regex
    public static ReleasedVersionRegex: RegExp = /^((?:\.?[0-9]+){3,})$/;

    private instance: AxiosInstance = axios.create({
        baseURL: "https://api.nuget.org",
    });
    private errorHandler: (error: Error) => void = (error: Error) => {
        this.outputChannel?.appendErrorLine(`Failed to request to public nuget endpoints due to ${error}`);
    };
    constructor(readonly globalEventBus?: GlobalEventBus, private readonly outputChannel?: PqSdkOutputChannel) {
        this.updateAxiosInstance();

        this.globalEventBus?.on(
            GlobalEvents.VSCodeEvents.onProxySettingsChanged,
            debounce(() => {
                this.updateAxiosInstance();
            }, 750).bind(this),
        );
    }

    private updateAxiosInstance(baseURL: string = "https://api.nuget.org"): void {
        const maybeHttpProxy: string | undefined = ExtensionConfigurations.httpProxy;

        if (maybeHttpProxy) {
            const proxyUrl: URL = new URL(maybeHttpProxy);
            const maybeHttpProxyAuthHeaderString: string | undefined = ExtensionConfigurations.httpProxyAuthorization;

            this.instance = axios.create({
                baseURL,
                proxy: {
                    protocol: formatUrlProtocol(proxyUrl.protocol),
                    host: proxyUrl.hostname,
                    port: parseInt(proxyUrl.port, 10),
                },
            });

            if (maybeHttpProxyAuthHeaderString) {
                this.instance.defaults.headers.common["Authorization"] = maybeHttpProxyAuthHeaderString;
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
            (versionStr: string) => NugetHttpService.ReleasedVersionRegex.exec(versionStr),
        );

        return preReleasedVersionIncludeVersions;
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

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as path from "path";

const NugetStdOutputOfVersionRegExp: RegExp = /(Microsoft\.PowerQuery\.SdkTools[ ])([0-9]+)\.([0-9]+)\.([0-9]+)/g;
const PathPartOfVersionRegExp: RegExp = /(Microsoft\.PowerQuery\.SdkTools\.)([0-9]+)\.([0-9]+)\.([0-9]+)/g;
const ReleasedVersionRegExp: RegExp = /([0-9]+)\.([0-9]+)\.([0-9]+)/;
export class NugetVersions {
    public static ZERO_VERSION: NugetVersions = new NugetVersions(0, 0, 0);

    /**
     * create NugetVersion from the std output like:
     * MSBuild auto-detection: using msbuild version '*****' from '\Microsoft Visual Studio\2019\*****\MSBuild\Current\Bin'.
     * Microsoft.PowerQuery.SdkTools 2.107.1
     * @param stdOutput
     */
    public static createFromNugetListOutput(stdOutput: string): NugetVersions {
        if (!stdOutput) return NugetVersions.ZERO_VERSION;

        let result: NugetVersions = NugetVersions.ZERO_VERSION;

        NugetStdOutputOfVersionRegExp.lastIndex = 0;
        const matched: RegExpMatchArray | null = NugetStdOutputOfVersionRegExp.exec(stdOutput);

        if (matched && matched.length === 5) {
            result = new NugetVersions(parseInt(matched[2], 10), parseInt(matched[3], 10), parseInt(matched[4], 10));
        }

        return result;
    }

    /**
     * create NugetVersions from the std output like:
     * MSBuild auto-detection: using msbuild version '*****' from '\Microsoft Visual Studio\2019\*****\MSBuild\Current\Bin'.
     * Microsoft.PowerQuery.SdkTools 2.110.3
     * Microsoft.PowerQuery.SdkTools 2.110.2
     * Microsoft.PowerQuery.SdkTools 2.109.6
     * Microsoft.PowerQuery.SdkTools 2.107.1
     * @param stdOutput
     */
    public static createFromNugetListAllOutput(stdOutput: string): NugetVersions[] {
        const result: NugetVersions[] = [];

        if (!stdOutput) return result;

        NugetStdOutputOfVersionRegExp.lastIndex = 0;
        let matched: RegExpMatchArray | null = NugetStdOutputOfVersionRegExp.exec(stdOutput);

        while (matched && matched.length === 5) {
            result.push(
                new NugetVersions(parseInt(matched[2], 10), parseInt(matched[3], 10), parseInt(matched[4], 10)),
            );

            matched = NugetStdOutputOfVersionRegExp.exec(stdOutput);
        }

        return result;
    }

    /**
     * create NugetVersion from a path like:
     * .\vscode-powerquery-sdk\.nuget\Microsoft.PowerQuery.SdkTools.2.107.1\tools\..
     * @param fullPath
     */
    public static createFromPath(fullPath: string | undefined): NugetVersions {
        if (!fullPath) return NugetVersions.ZERO_VERSION;

        const pathParts: string[] = fullPath.split(path.sep);
        let result: NugetVersions = NugetVersions.ZERO_VERSION;

        pathParts.some((onePath: string) => {
            const matched: RegExpMatchArray | null = PathPartOfVersionRegExp.exec(onePath);

            if (matched && matched.length === 5) {
                result = new NugetVersions(
                    parseInt(matched[2], 10),
                    parseInt(matched[3], 10),
                    parseInt(matched[4], 10),
                );

                return true;
            }

            return false;
        });

        return result;
    }

    /**
     * create NugetVersion from a released version like: 2.107.1
     * @param releasedVersionString
     */
    public static createFromReleasedVersionString(releasedVersionString: string): NugetVersions {
        if (!releasedVersionString) return NugetVersions.ZERO_VERSION;

        let result: NugetVersions = NugetVersions.ZERO_VERSION;
        const matched: RegExpMatchArray | null = ReleasedVersionRegExp.exec(releasedVersionString);

        if (matched && matched.length === 4) {
            result = new NugetVersions(parseInt(matched[1], 10), parseInt(matched[2], 10), parseInt(matched[3], 10));
        }

        return result;
    }

    public static compare(l: NugetVersions, r: NugetVersions): number {
        if (l.major == r.major) {
            if (l.minor == r.minor) {
                return l.patch - r.patch;
            } else {
                return l.minor - r.minor;
            }
        } else {
            return l.major - r.major;
        }
    }

    constructor(public readonly major: number, public readonly minor: number, public readonly patch: number) {}

    isZero(): boolean {
        return this === NugetVersions.ZERO_VERSION;
    }

    toString(): string {
        return `${this.major}.${this.minor}.${this.patch}`;
    }
}

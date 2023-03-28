/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as path from "path";

const NugetStdOutputOfVersionRegExp: RegExp = /(Microsoft\.PowerQuery\.SdkTools[ ])([0-9]+)\.([0-9]+)\.([0-9]+)/g;
const PathPartOfVersionRegExp: RegExp = /(Microsoft\.PowerQuery\.SdkTools\.)([0-9]+)\.([0-9]+)\.([0-9]+)/g;
const ReleasedVersionRegExp: RegExp = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const NumericRegExp: RegExp = /^[0-9]+$/;
export class NugetVersions {
    public static ZERO_VERSION: NugetVersions = new NugetVersions("0", "0", "0");

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
            result = new NugetVersions(matched[2], matched[3], matched[4]);
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
            result.push(new NugetVersions(matched[2], matched[3], matched[4]));

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
                result = new NugetVersions(matched[2], matched[3], matched[4]);

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
            result = new NugetVersions(matched[1], matched[2], matched[3]);
        }

        return result;
    }

    /**
     * create NugetVersion from a version like:
     *      2.107.1
     *      2
     *      2.x
     *      2.107
     *      2.107.x
     * @param fuzzyVersionString
     */
    public static createFromFuzzyVersionString(fuzzyVersionString: string): NugetVersions {
        if (!fuzzyVersionString) return NugetVersions.ZERO_VERSION;

        let result: NugetVersions = NugetVersions.ZERO_VERSION;
        const spitedString: string[] = fuzzyVersionString.split(".");

        if (spitedString && spitedString.length > 0) {
            result = new NugetVersions(spitedString[0], spitedString[1] ?? "", spitedString[2] ?? "");
        }

        return result;
    }

    public static compare(l: NugetVersions, r: NugetVersions): number {
        return (
            NugetVersions.compareIdentifiers(l.major, r.major) ||
            NugetVersions.compareIdentifiers(l.minor, r.minor) ||
            NugetVersions.compareIdentifiers(l.patch, r.patch)
        );
    }

    public static distance(l: NugetVersions, r: NugetVersions): number {
        const majorDist: number = NugetVersions.compareIdentifiers(l.major, r.major) * 1e6;

        if (majorDist !== 0) {
            return majorDist;
        } else {
            const minorDist: number = NugetVersions.compareIdentifiers(l.minor, r.minor) * 1e3;

            if (minorDist !== 0) {
                return minorDist;
            }

            return NugetVersions.compareIdentifiers(l.patch, r.patch);
        }
    }

    public static findClosetAmong(sortedVersionArr: NugetVersions[], expectedVersion: NugetVersions): NugetVersions {
        if (sortedVersionArr.length === 0) {
            return NugetVersions.ZERO_VERSION;
        } else if (sortedVersionArr.length === 1) {
            return sortedVersionArr[0];
        }

        let closestVersion: NugetVersions = sortedVersionArr[0];
        let minDistance: number = NugetVersions.distance(expectedVersion, closestVersion);

        for (let i: number = 1; i < sortedVersionArr.length; i++) {
            const distance: number = NugetVersions.distance(expectedVersion, sortedVersionArr[i]);

            if (distance < 0) {
                break;
            }

            if (distance <= minDistance) {
                closestVersion = sortedVersionArr[i];
                minDistance = distance;
            }
        }

        return closestVersion;
    }

    private static compareIdentifiers(l: string, r: string): number {
        const isLNumber: boolean = NumericRegExp.test(l);
        const isRNumber: boolean = NumericRegExp.test(r);

        let lNumber: number = -1;
        let rNumber: number = -1;

        if (isLNumber && isRNumber) {
            lNumber = parseInt(l, 10);
            rNumber = parseInt(r, 10);
        }

        if (l === r) {
            return 0;
        } else if (isLNumber && !isRNumber) {
            return -1;
        } else if (!isLNumber && isRNumber) {
            return 1;
        } else {
            return lNumber - rNumber;
        }
    }

    constructor(public readonly major: string, public readonly minor: string, public readonly patch: string) {}

    compare(other: NugetVersions): number {
        return NugetVersions.compare(this, other);
    }

    isZero(): boolean {
        return this === NugetVersions.ZERO_VERSION;
    }

    toString(): string {
        return `${this.major}.${this.minor}.${this.patch}`;
    }
}

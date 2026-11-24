/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as dotenv from "dotenv";
import * as dotenvExpand from "dotenv-expand";
import * as fs from "fs";
import * as path from "path";

import paths from "./paths";

const nodeEnvironment: string | undefined = process.env.NODE_ENV;

if (!nodeEnvironment) {
    throw new Error("The NODE_ENV environment variable is required but was not specified.");
}

const dotenvFiles: string[] = [
    `${paths.dotenv}.${nodeEnvironment}.local`,
    nodeEnvironment !== "test" ? `${paths.dotenv}.local` : "",
    `${paths.dotenv}.${nodeEnvironment}`,
    paths.dotenv,
].filter(Boolean);

for (const dotenvFile of dotenvFiles) {
    if (fs.existsSync(dotenvFile)) {
        dotenvExpand.expand(
            dotenv.config({
                path: dotenvFile,
            }),
        );
    }
}

const appDirectory: string = fs.realpathSync(process.cwd());
process.env.NODE_PATH = (process.env.NODE_PATH || "")
    .split(path.delimiter)
    .filter(folder => folder && !path.isAbsolute(folder))
    .map(folder => path.resolve(appDirectory, folder))
    .join(path.delimiter);

const reactApplicationVariable: RegExp = /^REACT_APP_/i;

export interface ClientEnvironment {
    raw: Record<string, string | boolean | undefined>;
    stringified: Record<"process.env", Record<string, string>>;
}

export default function getClientEnvironment(publicUrl?: string): ClientEnvironment {
    const raw: Record<string, string | boolean | undefined> = Object.keys(process.env)
        .filter(key => reactApplicationVariable.test(key))
        .reduce<Record<string, string | boolean | undefined>>(
            (environment, key) => {
                environment[key] = process.env[key];
                return environment;
            },
            {
                NODE_ENV: process.env.NODE_ENV || "development",
                PUBLIC_URL: publicUrl || "",
                WDS_SOCKET_HOST: process.env.WDS_SOCKET_HOST,
                WDS_SOCKET_PATH: process.env.WDS_SOCKET_PATH,
                WDS_SOCKET_PORT: process.env.WDS_SOCKET_PORT,
                FAST_REFRESH: process.env.FAST_REFRESH !== "false",
            },
        );
    const stringified: Record<string, string> = Object.keys(raw).reduce<Record<string, string>>((environment, key) => {
        environment[key] = JSON.stringify(raw[key]);
        return environment;
    }, {});

    return { raw, stringified: { "process.env": stringified } };
}

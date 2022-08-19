/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as fs from "fs";
import * as gulp from "gulp";
import * as nls from "vscode-nls-dev";
import * as path from "path";
import * as process from "process";

const projectDirectory: string = process.cwd();
const i18nDirectory: string = path.join(projectDirectory, "localize", "i18n");
const i18nDistDirectory: string = path.join(projectDirectory, "localize", "i18nDist");

const distDirectory: string = path.join(projectDirectory, "dist");

const webviewDistPqTestResI18nDirectory: string = path.join(
    projectDirectory,
    "webviewDist",
    "pq-test-result-view",
    "i18n",
);

if (fs.existsSync(i18nDistDirectory)) {
    fs.rmSync(i18nDistDirectory, { force: true, recursive: true });
}

fs.mkdirSync(i18nDistDirectory);

const allLangDirectories: string[] = fs
    .readdirSync(i18nDirectory, { withFileTypes: true })
    .filter((dirent: fs.Dirent) => dirent.isDirectory())
    .map((dirent: fs.Dirent) => dirent.name);

//  for each i18n json, first we need to copy them into the corresponding folders beneath lang's dist folder
//  package.nls.json                ->      i118nDist/{langId}/package.i18n.json
//  extension.json                  ->      dist/extension.{langId}.json
//  pq-test-result-view.json        ->      webviewDist/pq-test-result-view/i18n/pq-test-result-view.{langId}.json

for (const oneLangId of allLangDirectories) {
    const currentLangIdDirectory: string = path.join(i18nDistDirectory, oneLangId);

    fs.mkdirSync(currentLangIdDirectory);

    fs.copyFileSync(
        path.join(i18nDirectory, oneLangId, "package.nls.json"),
        path.join(currentLangIdDirectory, "package.i18n.json"),
    );

    fs.copyFileSync(
        path.join(i18nDirectory, oneLangId, "extension.json"),
        path.join(distDirectory, `extension.${oneLangId}.json`),
    );

    fs.copyFileSync(
        path.join(i18nDirectory, oneLangId, "pq-test-result-view.json"),
        path.join(webviewDistPqTestResI18nDirectory, `pq-test-result-view.${oneLangId}.json`),
    );

    console.log(`[AddI18n] create ${currentLangIdDirectory} directory`);
}

const supportedLanguages: nls.Language[] = allLangDirectories.map((id: string) => ({ id, folderName: id }));

gulp.src(["package.nls.json"], {
    cwd: projectDirectory,
})
    .pipe(nls.createAdditionalLanguageFiles(supportedLanguages, path.join("localize", "i18nDist"), "."))
    .pipe(gulp.dest(".", { cwd: projectDirectory }));

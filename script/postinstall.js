"use strict";

const childProcess = require("child_process");
const process = require("process");
const path = require("path");
const fs = require("fs");

const appDirectory = fs.realpathSync(process.cwd());
const pqTestResultViewDirector = path.resolve(appDirectory, "webviews", "pq-test-result-view");

process.chdir(pqTestResultViewDirector);
try {
    // clean install
    childProcess.execSync("npm ci", { stdio: "inherit" });
    // compile
    childProcess.execSync("npm run compile", { stdio: "inherit" });
} finally {
    process.chdir(appDirectory);
}

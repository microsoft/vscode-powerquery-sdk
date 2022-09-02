import * as fs from "fs";
import * as cp from "child_process";

const cwd = process.cwd();

const dirents: fs.Dirent[] = fs.readdirSync(cwd, { withFileTypes: true });

let oneVsixFile: string = "";

dirents.some((dirent: fs.Dirent) => {
    if (!dirent.isDirectory() && dirent.name.endsWith(".vsix")) {
        oneVsixFile = dirent.name;
        return true;
    }
    return false;
});

if (oneVsixFile) {
    cp.execSync(`code --install-extension ${oneVsixFile}`, { cwd });
} else {
    console.error('Cannot find one vsix file, please run "npm run vsix" before install.');
}

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { EditorView, InputBox, Key, TitleBar, Workbench } from "vscode-extension-tester";
import { expect } from "chai";

import { delay } from "../../utils/pids";
import { makeOneTmpDir } from "../../utils/osUtils";
import { removeDirectoryRecursively } from "../../utils/files";

describe("New extension project Tests", () => {
    it("Command to create a new extension project FirstConn", async () => {
        const oneTmpDir = makeOneTmpDir();

        try {
            const workbench = new Workbench();
            await workbench.executeCommand("power query: create an extension project");

            // InputBox.
            const inputBox = await InputBox.create();
            await inputBox.setText("FirstConn");
            await inputBox.sendKeys(Key.ENTER);
            await inputBox.sendKeys(Key.chord(Key.CONTROL, "A"));
            await inputBox.sendKeys(oneTmpDir);
            await inputBox.sendKeys(Key.ENTER);

            await delay(5e3);

            const editorView = new EditorView();
            const titles = await editorView.getOpenEditorTitles();

            expect(titles.indexOf("FirstConn.pq")).to.eq(1);

            const titleBar = new TitleBar();

            const fileItem = await titleBar.getItem("File");
            const fileSubItem = await fileItem?.select();
            await fileSubItem?.select("Close Folder");

            await delay(2e3);
        } finally {
            await removeDirectoryRecursively(oneTmpDir);
        }
    }).timeout(0);
});

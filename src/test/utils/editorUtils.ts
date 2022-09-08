/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as chai from "chai";
import { EditorView, Workbench } from "vscode-extension-tester";

const expect = chai.expect;

export module VscEditors {
    export async function getCurrentlyOpenedEditorTitles(workbench?: Workbench): Promise<string[]> {
        const editorView = workbench ? workbench.getEditorView() : new EditorView();

        return await editorView.getOpenEditorTitles();
    }

    export async function assertPqTestResultEditorExisting(workbench?: Workbench): Promise<void> {
        const currentAllEditorTitle = await VscEditors.getCurrentlyOpenedEditorTitles(workbench);
        expect(currentAllEditorTitle.indexOf("PQTest result")).gt(-1);
    }

    export async function evalCurPqOfAnEditor(fileName: string, workbench?: Workbench): Promise<unknown> {
        const editorView = workbench ? workbench.getEditorView() : new EditorView();
        const openedEditor = await editorView.openEditor(fileName);
        const curCtxMenu = await openedEditor.openContextMenu();
        const evalMenuItem = await curCtxMenu.getItem("Evaluate current power query file");

        return evalMenuItem?.click();
    }
}

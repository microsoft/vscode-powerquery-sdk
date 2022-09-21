/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as chai from "chai";
import { EditorView, Workbench } from "vscode-extension-tester";
import { extensionI18n, rootI18n } from "../common";

const expect = chai.expect;

export module VscEditors {
    export async function getCurrentlyOpenedEditorTitles(workbench?: Workbench): Promise<string[]> {
        const editorView = workbench ? workbench.getEditorView() : new EditorView();

        return await editorView.getOpenEditorTitles();
    }

    export async function assertPqTestResultEditorExisting(workbench?: Workbench): Promise<void> {
        const resultViewTitle = extensionI18n["PQTest.result.view.title"];

        const currentAllEditorTitle = await VscEditors.getCurrentlyOpenedEditorTitles(workbench);
        expect(currentAllEditorTitle.indexOf(resultViewTitle)).gt(-1);
    }

    export async function evalCurPqOfAnEditor(fileName: string, workbench?: Workbench): Promise<unknown> {
        const runTestBatteryCommandTitle = rootI18n["extension.pqtest.RunTestBatteryCommand.title"];

        const editorView = workbench ? workbench.getEditorView() : new EditorView();
        const openedEditor = await editorView.openEditor(fileName);
        const curCtxMenu = await openedEditor.openContextMenu();
        const evalMenuItem = await curCtxMenu.getItem(runTestBatteryCommandTitle);

        return evalMenuItem?.click();
    }
}

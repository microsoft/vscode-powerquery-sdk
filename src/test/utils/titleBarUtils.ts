/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { TitleBar, Workbench } from "vscode-extension-tester";

import { delay } from "../../utils/pids";

export module VscTitleBar {
    export async function closeFolder(workbench?: Workbench): Promise<void> {
        const titleBar = workbench ? workbench.getTitleBar() : new TitleBar();

        const fileItem = await titleBar.getItem("File");
        const fileSubItem = await fileItem?.select();
        await fileSubItem?.select("Close Folder");

        await delay(2e3);
    }
}

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { DefaultTreeSection, InputBox, SideBarView, ViewSection, Workbench } from "vscode-extension-tester";

import { extensionI18n, rootI18n } from "../common";
import { delay } from "../../utils/pids";

export module VscSideBars {
    export async function expandAndShowPqSdkSection(workbench?: Workbench): Promise<ViewSection> {
        const primaryExplorerName = rootI18n["extension.pqtest.explorer.name"];

        const sideBarView = workbench ? workbench.getSideBar() : new SideBarView();
        const pqSdkViewSection = await sideBarView.getContent().getSection(primaryExplorerName);

        await pqSdkViewSection.expand();

        return pqSdkViewSection;
    }

    export async function openFileFromDefaultViewSection(
        workspaceName: string,
        fileNameToOpen: string,
        workbench?: Workbench,
    ): Promise<unknown> {
        const sideBarView = workbench ? workbench.getSideBar() : new SideBarView();

        const defaultViewSection = (await sideBarView.getContent().getSection(workspaceName)) as DefaultTreeSection;

        const theFile = await defaultViewSection.findItem(fileNameToOpen);

        return theFile?.click();
    }

    export async function clickClearAllCredentials(pqSdkViewSection: ViewSection): Promise<void> {
        const deleteAllCredentialsTitle = extensionI18n["PQSdk.lifecycleTreeView.item.deleteAllCredentials.title"];
        const clearAllCredentialsItem = await pqSdkViewSection.findItem(deleteAllCredentialsTitle);
        clearAllCredentialsItem?.click();
        await delay(750);
    }

    export async function clickSetCredentialAndPick(
        pqSdkViewSection: ViewSection,
        candidates: string[],
    ): Promise<void> {
        const createOneCredentialTitle = extensionI18n["PQSdk.lifecycleTreeView.item.createOneCredential.title"];
        const setCredentialItem = await pqSdkViewSection.findItem(createOneCredentialTitle);
        setCredentialItem?.click();
        await delay(750);

        const stepCount = candidates.length;
        let step = 0;

        while (step < stepCount) {
            // eslint-disable-next-line no-await-in-loop
            const currentInputBox = await InputBox.create();
            const picks = await currentInputBox.getQuickPicks();
            let selectedPick = picks[0];

            for (const onePick of picks) {
                const onePickText = await onePick.getText();

                if (onePickText.indexOf(candidates[step]) > -1) {
                    selectedPick = onePick;
                }
            }

            await selectedPick.select();

            await delay(750);
            step++;
        }
    }
}

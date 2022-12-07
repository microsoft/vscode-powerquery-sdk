/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as chai from "chai";

import { Workbench } from "vscode-extension-tester";

import {
    ConnectorProjects,
    PqSdkNugetPackages,
    VscEditors,
    VscNotifications,
    VscOutputChannels,
    VscSettings,
    VscSideBars,
    VscTitleBar,
} from "../utils";

import { delay } from "../../utils/pids";
import { makeOneTmpDir } from "../../utils/osUtils";
import { tryRemoveDirectoryRecursively } from "../../utils/files";

const expect = chai.expect;

describe("New extension project Tests", () => {
    describe("FirstConn project", () => {
        const newExtensionName: string = "FirstConn";
        let oneTmpDir: string | undefined = makeOneTmpDir();

        it(`Command to create a new extension project ${newExtensionName} beneath ${oneTmpDir}`, async () => {
            const workbench = new Workbench();
            await VscSettings.ensureUseServiceHostDisabled(workbench);

            await PqSdkNugetPackages.assertPqSdkToolExisting();

            await ConnectorProjects.createOneNewExtensionProject(workbench, newExtensionName, oneTmpDir!);

            // assert we got sdk populated in the settings
            ConnectorProjects.assertNewlyCreatedWorkspaceSettingsIntact(newExtensionName, oneTmpDir!);

            const titles = await VscEditors.getCurrentlyOpenedEditorTitles(workbench);

            // assert that we got its default connector pq file opened by default
            // for each freshly created new project
            expect(titles.indexOf(`${newExtensionName}.pq`)).gt(-1);

            const pqSdkViewSection = await VscSideBars.expandAndShowPqSdkSection(workbench);

            // await few time to ensure new mez got built
            await delay(15e3);

            // Clear ALL credentials
            await VscSideBars.clickClearAllCredentials(pqSdkViewSection);

            await VscSideBars.clickSetCredentialAndPick(pqSdkViewSection, [
                newExtensionName,
                `${newExtensionName}.query.pq`,
                "Anonymous",
            ]);

            // await few time to ensure notification popped up
            await delay(10e3);
            // New Anonymous credential has been generated successfully
            await VscNotifications.assetNotificationsLength(1);

            await VscSideBars.openFileFromDefaultViewSection(
                newExtensionName,
                `${newExtensionName}.query.pq`,
                workbench,
            );

            await VscEditors.evalCurPqOfAnEditor(`${newExtensionName}.query.pq`, workbench);

            // PQTest result

            // await few time to ensure pqtest result popped up
            await delay(10e3);

            await VscEditors.assertPqTestResultEditorExisting(workbench);

            const outputView = await VscOutputChannels.bringUpPQSdkOutputChannel();

            const currentPqSdkOutputText = await outputView.getText();
            expect(currentPqSdkOutputText.indexOf(`Hello from ${newExtensionName}: (no message)`)).gt(-1);
            await outputView.clearText();

            await VscTitleBar.closeFolder(workbench);
        }).timeout(0);

        after(() => {
            if (oneTmpDir) {
                void tryRemoveDirectoryRecursively(oneTmpDir);
                oneTmpDir = undefined;
            }
        });
    });

    describe("FirstSevHostConn project", () => {
        const newExtensionName: string = "FirstSevHostConn";
        let oneTmpDir: string | undefined = makeOneTmpDir();

        it(`Command to create a new extension project ${newExtensionName} beneath ${oneTmpDir}`, async () => {
            const workbench = new Workbench();
            await VscSettings.ensureUseServiceHostEnabled(workbench);

            await PqSdkNugetPackages.assertPqSdkToolExisting();

            await ConnectorProjects.createOneNewExtensionProject(workbench, newExtensionName, oneTmpDir!);

            // assert we got sdk populated in the settings
            ConnectorProjects.assertNewlyCreatedWorkspaceSettingsIntact(newExtensionName, oneTmpDir!);

            const titles = await VscEditors.getCurrentlyOpenedEditorTitles(workbench);

            // assert that we got its default connector pq file opened by default
            // for each freshly created new project
            expect(titles.indexOf(`${newExtensionName}.pq`)).gt(-1);

            const pqSdkViewSection = await VscSideBars.expandAndShowPqSdkSection(workbench);

            // await few time to ensure new mez got built
            await delay(15e3);

            // Clear ALL credentials
            await VscSideBars.clickClearAllCredentials(pqSdkViewSection);

            await VscSideBars.clickSetCredentialAndPick(pqSdkViewSection, [
                newExtensionName,
                `${newExtensionName}.query.pq`,
                "Anonymous",
            ]);

            // await few time to ensure notification popped up
            await delay(10e3);
            // New Anonymous credential has been generated successfully
            await VscNotifications.assetNotificationsLength(1);

            await VscSideBars.openFileFromDefaultViewSection(
                newExtensionName,
                `${newExtensionName}.query.pq`,
                workbench,
            );

            await VscEditors.evalCurPqOfAnEditor(`${newExtensionName}.query.pq`, workbench);

            // PQTest result

            // await few time to ensure pqtest result popped up
            await delay(10e3);

            await VscEditors.assertPqTestResultEditorExisting(workbench);

            const outputView = await VscOutputChannels.bringUpPQSdkOutputChannel();

            const currentPqSdkOutputText = await outputView.getText();
            expect(currentPqSdkOutputText.indexOf(`Hello from ${newExtensionName}: (no message)`)).gt(-1);
            await outputView.clearText();

            await VscTitleBar.closeFolder(workbench);
        }).timeout(0);

        after(() => {
            if (oneTmpDir) {
                void tryRemoveDirectoryRecursively(oneTmpDir);
                oneTmpDir = undefined;
            }
        });
    });
});

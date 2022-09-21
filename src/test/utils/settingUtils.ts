/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { Setting, SettingsEditor, Workbench } from "vscode-extension-tester";
import { delay } from "../../utils/pids";

export module VscSettings {
    export async function findSettings(title: string, categories: string[], workbench?: Workbench): Promise<Setting> {
        const settingsEditor = workbench ? await workbench.openSettings() : new SettingsEditor();

        return settingsEditor.findSetting(title, ...categories);
    }

    export function findEnableServiceHostSetting(workbench?: Workbench): Promise<Setting> {
        // this string got rephrased out of the contributor path 'powerquery.sdk.features.useServiceHost'
        return VscSettings.findSettings("Use Service Host", ["Powerquery", "Sdk", "Features"], workbench);
    }

    export async function ensureUseServiceHostDisabled(workbench?: Workbench): Promise<void> {
        const enableServiceHostSetting = await VscSettings.findEnableServiceHostSetting(workbench);
        const enableServiceHostValue = await enableServiceHostSetting.getValue();

        if (enableServiceHostValue) {
            await enableServiceHostSetting.setValue(false);
            // vsc built in commands
            workbench?.executeCommand("Developer: Reload Window");
        }

        await delay(750);
    }

    export async function ensureUseServiceHostEnabled(workbench?: Workbench): Promise<void> {
        const enableServiceHostSetting = await VscSettings.findEnableServiceHostSetting(workbench);
        const enableServiceHostValue = await enableServiceHostSetting.getValue();

        if (!enableServiceHostValue) {
            await enableServiceHostSetting.setValue(true);
            // vsc built in commands
            workbench?.executeCommand("Developer: Reload Window");
        }

        await delay(750);
    }
}

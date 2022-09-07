/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as chai from "chai";

import { Workbench } from "vscode-extension-tester";

const expect = chai.expect;

export module VscNotifications {
    export async function assetNotificationsExisting(workbench?: Workbench): Promise<void> {
        const notifications = workbench ? await workbench.getNotifications() : await new Workbench().getNotifications();
        expect(notifications.length).gt(0);
    }

    export async function assetNotificationsLength(length: number, workbench?: Workbench): Promise<void> {
        const notifications = workbench ? await workbench.getNotifications() : await new Workbench().getNotifications();
        expect(notifications.length).eq(length);
    }
}

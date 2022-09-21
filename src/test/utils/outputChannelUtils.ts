/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as chai from "chai";

import { BottomBarPanel, OutputView } from "vscode-extension-tester";

import { delay } from "../../utils/pids";
import { pqSdkOutputChannelName } from "../common";

const expect = chai.expect;

export module VscOutputChannels {
    export async function bringUpPQSdkOutputChannel(): Promise<OutputView> {
        const outputView = await new BottomBarPanel().openOutputView();

        // get names of all available channels
        const outputChannelNames = await outputView.getChannelNames();
        expect(outputChannelNames.indexOf(pqSdkOutputChannelName)).gt(-1);
        // select a channel from the drop box by name
        await outputView.selectChannel(pqSdkOutputChannelName);

        await delay(250);

        return outputView;
    }
}

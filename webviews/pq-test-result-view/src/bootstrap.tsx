/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import React from "react";
import ReactDom from "react-dom";

import { initializeIcons } from "@fluentui/react/lib/Icons";
import App from "./App";

initializeIcons();

window.addEventListener(
    "contextmenu",
    e => {
        e.stopImmediatePropagation();
    },
    true,
);

ReactDom.render(<App />, document.querySelector("#root"));

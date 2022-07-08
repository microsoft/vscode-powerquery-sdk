/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import React from "react";
import ReactDom from "react-dom";
import App from "./App";

window.addEventListener(
    "contextmenu",
    e => {
        e.stopImmediatePropagation();
    },
    true,
);

ReactDom.render(<App />, document.querySelector("#root"));

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import React from "react";
import { ThemeProvider } from "@fluentui/react/lib/Theme";

import { useVSCodeContextProps, VSCodeContextProvider } from "./contexts/VscodeContexts";
import { TestBatteryResultView } from "./views/TestBatteryResultView";

import "./App.scss";

const Entry: React.FC<{}> = React.memo(() => {
    const { latestPqTestResult, fluentTheme } = useVSCodeContextProps();

    return (
        <div className="entry-container">
            <ThemeProvider theme={fluentTheme}>
                {!!latestPqTestResult && Array.isArray(latestPqTestResult) && latestPqTestResult.length ? (
                    <TestBatteryResultView testRunExecution={latestPqTestResult[0]} />
                ) : null}
            </ThemeProvider>
        </div>
    );
});

const App: React.FC<{}> = React.memo(() => {
    return (
        <VSCodeContextProvider>
            <Entry />
        </VSCodeContextProvider>
    );
});

export default App;

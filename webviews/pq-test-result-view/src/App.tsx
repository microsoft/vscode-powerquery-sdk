import React, { useState, useEffect } from "react";

import "./App.scss";

interface VSCodeState {
    latestPqTestResult?: any;
}

const vscode = acquireVsCodeApi<VSCodeState>();
const histState: VSCodeState = vscode.getState() || {};

const App: React.FC<{}> = React.memo(() => {
    const [latestPqTestResult, setLatestPqTestResult] = useState<any>(histState.latestPqTestResult || "");

    useEffect(() => {
        window.addEventListener("message", event => {
            const message = event.data;
            switch (message.type) {
                case "OnOneValueUpdated":
                    if (message.payload.property === "latestPqTestResult") {
                        const theVal = message.payload.value;
                        setLatestPqTestResult(theVal);
                        vscode.setState({ ...histState, latestPqTestResult: theVal });
                    }
                    break;
            }
        });
    }, []);

    return <pre>{JSON.stringify(latestPqTestResult, null, 2)}</pre>;
});

export default App;

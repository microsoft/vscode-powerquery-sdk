import * as React from "react";
import { useState, useMemo, useContext, useEffect } from "react";

import { buildTheme } from "../themes";

interface VSCodeState {
    latestPqTestResult?: any;
}

const vscode = acquireVsCodeApi<VSCodeState>();

let histState: VSCodeState = vscode.getState() ?? {};

interface VSCodeContextProps {
    fluentTheme: any;
    latestPqTestResult?: any;
}

const initVSCodeContextProps: VSCodeContextProps = {
    ...histState,
    fluentTheme: buildTheme(),
};

const theVSCodeContextProps = React.createContext<VSCodeContextProps>(initVSCodeContextProps);

interface VSCodeContextActions {
    readonly onReady: () => void;
}

const initVSCodeContextActions: VSCodeContextActions = {
    onReady: () => {
        vscode.postMessage({ type: "onReady" });
    },
};

const theVscodeContextActions = React.createContext<VSCodeContextActions>(initVSCodeContextActions);

export const useVSCodeContextProps = () => {
    return useContext(theVSCodeContextProps);
};

export const useVSCodeContextActions = () => {
    return useContext(theVscodeContextActions);
};

export const VSCodeContextProvider: React.FC = React.memo(props => {
    const { children } = props;
    const [curCtx, updateContext] = useState<VSCodeContextProps>(initVSCodeContextProps);

    useEffect(() => {
        window.addEventListener("message", event => {
            const message = event.data;
            switch (message.type) {
                case "OnOneValueUpdated":
                    if (message.payload.property === "latestPqTestResult") {
                        const theVal = message.payload.value;
                        if (theVal) {
                            updateContext(prevState => ({ ...prevState, latestPqTestResult: theVal }));
                            histState = { ...histState, latestPqTestResult: theVal };
                            vscode.setState(histState);
                        }
                    } else if (message.payload.property === "activeColorTheme") {
                        updateContext(prevState => ({ ...prevState, fluentTheme: buildTheme() }));
                    }
                    break;
            }
        });
        vscode.postMessage({ type: "onReady" });
    }, []);

    const actions = useMemo<VSCodeContextActions>(() => {
        return initVSCodeContextActions;
    }, []);
    return (
        <theVSCodeContextProps.Provider value={curCtx}>
            <theVscodeContextActions.Provider value={actions}>{children}</theVscodeContextActions.Provider>
        </theVSCodeContextProps.Provider>
    );
});

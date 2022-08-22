/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as React from "react";
import { useState, useMemo, useContext, useEffect, useCallback } from "react";

import { buildTheme } from "../themes";
import { handleLocaleChange } from "../i18n";

interface VSCodeState {
    locale?: any;
    latestPqTestResult?: any;
}

const vscode = acquireVsCodeApi<VSCodeState>();

let histState: VSCodeState = vscode.getState() ?? {};

interface VSCodeContextProps {
    locale: string;
    fluentTheme: any;
    latestPqTestResult?: any;
}

const initVSCodeContextProps: VSCodeContextProps = {
    locale: "",
    ...histState,
    fluentTheme: buildTheme(),
};

const theVSCodeContextProps = React.createContext<VSCodeContextProps>(initVSCodeContextProps);

interface VSCodeContextActions {
    readonly onReady: () => void;
    readonly updateOneContextValue: (prop: string, value: any, alsoWriteToHist?: boolean) => void;
}

const initVSCodeContextActions: VSCodeContextActions = {
    onReady: () => {
        vscode.postMessage({ type: "onReady" });
    },
    updateOneContextValue: () => {
        // noop
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

    const updateOneContextValue = useCallback((prop: string, value: any, alsoWriteToHist?: boolean) => {
        updateContext(prevState => ({ ...prevState, [prop]: value }));
        if (alsoWriteToHist) {
            histState = { ...histState, [prop]: value };
            vscode.setState(histState);
        }
    }, []);

    useEffect(() => {
        handleLocaleChange().then(() => {
            updateOneContextValue("locale", "en-US", true);
        });
        window.addEventListener("message", event => {
            const message = event.data;
            switch (message.type) {
                case "OnOneValueUpdated":
                    if (message.payload.property === "latestPqTestResult") {
                        const theVal = message.payload.value;
                        if (theVal) {
                            updateOneContextValue(message.payload.property, message.payload.value, true);
                        }
                    } else if (message.payload.property === "locale") {
                        handleLocaleChange(message.payload.value).then(() => {
                            updateOneContextValue(message.payload.property, message.payload.value, true);
                        });
                    } else if (message.payload.property === "activeColorTheme") {
                        updateContext(prevState => ({ ...prevState, fluentTheme: buildTheme() }));
                    }
                    break;
            }
        });
        vscode.postMessage({ type: "onReady" });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const actions = useMemo<VSCodeContextActions>(() => {
        return { ...initVSCodeContextActions, updateOneContextValue };
    }, [updateOneContextValue]);
    return (
        <theVSCodeContextProps.Provider value={curCtx}>
            <theVscodeContextActions.Provider value={actions}>{children}</theVscodeContextActions.Provider>
        </theVSCodeContextProps.Provider>
    );
});

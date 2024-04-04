import { LocatorDiff } from "vscode-extension-tester-monaco-page-objects";
import { By } from "selenium-webdriver";

export const diff: LocatorDiff = {
    locators: {
        TerminalView: {
            constructor: By.className('terminal-outer-container')
        }
    }
}

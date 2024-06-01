import { By, LocatorDiff } from "vscode-extension-tester-monaco-page-objects";
export const diff: LocatorDiff = {
    locators: {
        BottomBarPanel: {
            tabContainer: By.className('composite-bar-container')
        }
    }
}

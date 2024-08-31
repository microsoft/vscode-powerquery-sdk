import { By, LocatorDiff } from "vscode-extension-tester-monaco-page-objects";
export const diff: LocatorDiff = {
    locators: {
        Input: {
            quickPickIndex: (index: number) => By.xpath(`.//div[@role='option' and @data-index='${index}']`),
        },

    }
}

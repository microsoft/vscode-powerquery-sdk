import { By, LocatorDiff } from "vscode-extension-tester-monaco-page-objects";

export const diff: LocatorDiff = {
    locators: {
        FindWidget: {
            toggleReplace: By.xpath(`.//div[@title="Toggle Replace"]`),
        }
    }
}

import { ActivityBar, DebugView, SideBarView, ScmView } from "../..";
import { ElementWithContexMenu } from "../ElementWithContextMenu";
import { WebElement } from "selenium-webdriver";
import { NewScmView } from "../sidebar/scm/NewScmView";

/**
 * Page object representing a view container item in the activity bar
 */
export class ViewControl extends ElementWithContexMenu {
    constructor(element: WebElement, bar: ActivityBar) {
        super(element, bar);
    }

    /**
     * Opens the associated view if not already open
     * @returns Promise resolving to SideBarView object representing the opened view
     */
    async openView(): Promise<SideBarView> {
        // Check whether view is already open
        const klass = await this.getAttribute(ViewControl.locators.ViewControl.attribute);
        if (klass.indexOf(ViewControl.locators.ViewControl.klass) < 0) {
            await this.click();
            await ViewControl.driver.sleep(500);
        }
        const view = await new SideBarView().wait();
        if ((await view.findElements(ViewControl.locators.ViewControl.scmId)).length > 0) {
            if (ViewControl.versionInfo.browser === 'vscode' && ViewControl.versionInfo.version >= '1.47.0') {
                return new NewScmView().wait();
            }
            return new ScmView().wait();
        }
        if ((await view.findElements(ViewControl.locators.ViewControl.debugId)).length > 0) {
            return new DebugView().wait();
        }
        return view;
    }

    /**
     * Closes the associated view if not already closed
     * @returns Promise resolving when the view closes
     */
    async closeView(): Promise<void> {        
        const klass = await this.getAttribute(ViewControl.locators.ViewControl.attribute);
        if (klass.indexOf(ViewControl.locators.ViewControl.klass) > -1) {
            await this.click();
        }
    }

    /**
     * Returns the title of the associated view
     */
    async getTitle(): Promise<string> {
        const badge = await this.findElement(ViewControl.locators.ViewControl.badge);
        return await badge.getAttribute('aria-label');
    }
}

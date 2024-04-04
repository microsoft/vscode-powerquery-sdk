import { TreeItem } from "../../ViewItem";
import { TreeSection } from "../TreeSection";
import { WebElement } from "selenium-webdriver";
import { NullAttributeError } from "../../../../errors/NullAttributeError";

/**
 * Default tree item base on the items in explorer view
 */
export class DefaultTreeItem extends TreeItem {
    constructor(element: WebElement, viewPart: TreeSection) {
        super(element, viewPart);
    }

    async getLabel(): Promise<string> {
        const value = await this.getAttribute(DefaultTreeItem.locators.DefaultTreeSection.itemLabel);
        if (value === null) {
            throw new NullAttributeError(`${this.constructor.name}.getLabel returned null`);
        }
        return value;
    }

    override async getTooltip(): Promise<string> {
        const tooltip = await this.findElement(DefaultTreeItem.locators.DefaultTreeItem.tooltip);
        return await tooltip.getAttribute(DefaultTreeItem.locators.DefaultTreeItem.labelAttribute);
    }

    async isExpanded(): Promise<boolean> {
        const twistieClass = await this.findElement(DefaultTreeItem.locators.DefaultTreeItem.twistie).getAttribute('class');
        return twistieClass.indexOf('collapsed') < 0;
    }

    async getChildren(): Promise<TreeItem[]> {
        const rows = await this.getChildItems(DefaultTreeItem.locators.DefaultTreeSection.itemRow);
        const items = await Promise.all(rows.map(async row => new DefaultTreeItem(row, this.enclosingItem as TreeSection).wait()));
        return items;
    }

    async isExpandable(): Promise<boolean> {
        const twistieClass = await this.findElement(DefaultTreeItem.locators.DefaultTreeItem.twistie).getAttribute('class');
        return twistieClass.indexOf('collapsible') > -1;
    }
}

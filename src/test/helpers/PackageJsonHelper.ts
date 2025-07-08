/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const packageJson = require("../../../package.json");

export interface CommandContribution {
    command: string;
    title: string;
    category?: string;
    icon?: string;
}

export interface ViewContribution {
    id: string;
    name: string;
    when?: string;
    icon?: string;
}

export interface MenuContribution {
    command: string;
    when?: string;
    group?: string;
}

/**
 * Get the contributes section from package.json
 * Use this only when VS Code APIs are not sufficient for testing
 */
export function getExtensionContributes(): Record<string, unknown> {
    return packageJson.contributes || {};
}

/**
 * Get command contributions from package.json
 * Note: Prefer using vscode.commands.getCommands() for runtime testing
 */
export function getCommandContributions(): CommandContribution[] {
    const contributes = getExtensionContributes();

    return (contributes.commands as CommandContribution[]) || [];
}

/**
 * Get view contributions from package.json explorer section
 * Note: Prefer using VS Code APIs for runtime testing
 */
export function getViewContributions(): ViewContribution[] {
    const contributes = getExtensionContributes();
    const views = contributes.views as Record<string, ViewContribution[]>;

    return views?.explorer || [];
}

/**
 * Get viewsWelcome contributions from package.json
 */
export function getViewsWelcomeContributions(): Array<{ view: string; contents: string }> {
    const contributes = getExtensionContributes();

    return (contributes.viewsWelcome as Array<{ view: string; contents: string }>) || [];
}

/**
 * Get menu contributions from package.json
 */
export function getMenuContributions(): Record<string, MenuContribution[]> {
    const contributes = getExtensionContributes();

    return (contributes.menus as Record<string, MenuContribution[]>) || {};
}

/**
 * Get activation events from package.json
 */
export function getActivationEvents(): string[] {
    return packageJson.activationEvents || [];
}

/**
 * Get extension dependencies from package.json
 */
export function getExtensionDependencies(): string[] {
    return packageJson.extensionDependencies || [];
}

/**
 * Helper to find a specific command contribution
 */
export function findCommandContribution(commandId: string): CommandContribution | undefined {
    return getCommandContributions().find(cmd => cmd.command === commandId);
}

/**
 * Helper to find a specific view contribution
 */
export function findViewContribution(viewId: string): ViewContribution | undefined {
    return getViewContributions().find(view => view.id === viewId);
}

/**
 * Helper to check if an activation event exists
 */
export function hasActivationEvent(event: string): boolean {
    return getActivationEvents().some(
        activationEvent => activationEvent.includes(event) || event.includes(activationEvent),
    );
}

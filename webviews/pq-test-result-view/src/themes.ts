/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

export function getCssVariable(variableName: string, defaultValue: string): string {
    // do not use nullish coalescing here, as getPropertyValue would return empty string
    // "" ?? "yoo" -> ""
    // undefined ?? "yoo" -> "yoo"
    // "" || "yoo" -> "yoo"
    // undefined || "yoo" -> "yoo"
    return getComputedStyle(document.documentElement).getPropertyValue(variableName) || defaultValue;
}

export function buildTheme() {
    return {
        palette: {
            themePrimary: getCssVariable("--vscode-button-background", "#348dd1"),
            themeLighterAlt: getCssVariable("--vscode-scrollbar-shadow", "#020608"),
            themeLighter: getCssVariable("--vscode-editor-background", "#081721"),
            themeLight: getCssVariable("--vscode-editorWidget-background", "#102a3f"),
            themeTertiary: getCssVariable("--vscode-progressBar-background", "#1f557d"),
            themeSecondary: getCssVariable("--vscode-progressBar-background", "#2e7cb8"),
            themeDarkAlt: getCssVariable("---vscode-sash-hoverBorder", "#4597d6"),
            themeDark: getCssVariable("--vscode-editorInfo-foreground", "#5fa6dc"),
            themeDarker: getCssVariable("--vscode-editorLink-activeForeground", "#85bce5"),
            neutralLighterAlt: getCssVariable("--vscode-editorGroup-border", "#323232"),
            neutralLighter: getCssVariable("--vscode-editorGroup-dropBackground", "#313131"),
            neutralLight: getCssVariable("-vscode-editorGroupHeader-tabsBackground", "#2f2f2f"),
            neutralQuaternaryAlt: getCssVariable("--vscode-editorPane-background", "#2c2c2c"),
            neutralQuaternary: getCssVariable("--vscode-tab-activeBackground", "#2a2a2a"),
            neutralTertiaryAlt: getCssVariable("--vscode-statusBarItem-prominentBackground", "#282828"),
            neutralTertiary: getCssVariable("--vscode-editorGroup-dropIntoPromptForeground", "#c8c8c8"),
            neutralSecondary: getCssVariable("--vscode-panelTitle-activeForeground", "#d0d0d0"),
            neutralPrimaryAlt: getCssVariable("--vscode-panelTitle-activeBorder", "#dadada"),
            neutralPrimary: getCssVariable("--vscode-banner-foreground", "#ffffff"),
            neutralDark: getCssVariable("--vscode-panelTitle-inactiveForeground", "#f4f4f4"),
            black: getCssVariable("--vscode-editor-foreground", "#f8f8f8"),
            white: getCssVariable("--vscode-editor-background", "#333333"),
        },
    };
}

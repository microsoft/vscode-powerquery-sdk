/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as assert from "assert";
import * as vscode from "vscode";

import { Views, WebviewConfig } from "../TestConstants";

export interface WebviewTestOptions {
    enableScripts?: boolean;
    retainContextWhenHidden?: boolean;
    localResourceRoots?: vscode.Uri[];
}

export interface WebviewMessageTestOptions {
    messageTimeout?: number;
    expectedMessageType?: string;
}

/**
 * Create a test webview panel with standard configuration and automatic cleanup
 */
export function createTestWebviewPanel(
    viewType: string = Views.ResultWebView,
    title: string = "Test Panel",
    showOptions: vscode.ViewColumn = vscode.ViewColumn.One,
    options?: WebviewTestOptions,
): vscode.WebviewPanel {
    const panel = vscode.window.createWebviewPanel(viewType, title, showOptions, {
        ...WebviewConfig.DefaultOptions,
        ...options,
    });

    return panel;
}

/**
 * Higher-order function that creates a webview panel, runs a test, and cleans up automatically
 */
export async function withWebviewPanel<T>(
    testFn: (panel: vscode.WebviewPanel) => Promise<T> | T,
    viewType?: string,
    title?: string,
    options?: WebviewTestOptions,
): Promise<T> {
    const panel = createTestWebviewPanel(viewType, title, vscode.ViewColumn.One, options);

    try {
        return await testFn(panel);
    } finally {
        panel.dispose();
    }
}

/**
 * Test webview message passing with timeout handling
 */
export async function createWebviewMessageTest(
    panel: vscode.WebviewPanel,
    htmlContent: string,
    options: WebviewMessageTestOptions = {},
): Promise<{ messageReceived: boolean; receivedMessage?: unknown }> {
    const { messageTimeout = WebviewConfig.MessageTimeout, expectedMessageType } = options;

    let messageReceived = false;
    let receivedMessage: unknown;

    const messagePromise = new Promise<void>(resolve => {
        panel.webview.onDidReceiveMessage(message => {
            if (!expectedMessageType || message.type === expectedMessageType) {
                messageReceived = true;
                receivedMessage = message;
                resolve();
            }
        });
    });

    // Set the HTML content
    panel.webview.html = htmlContent;

    // Wait for message with timeout
    try {
        await Promise.race([
            messagePromise,
            new Promise<void>((_, reject) => {
                setTimeout(() => reject(new Error("Message timeout")), messageTimeout);
            }),
        ]);
    } catch {
        // Timeout occurred, but that's okay for testing
    }

    return { messageReceived, receivedMessage };
}

/**
 * Create HTML content for webview message testing
 */
export function createMessageTestHtml(
    messageType: string = "test",
    messageData: unknown = "Hello from webview",
    delay: number = WebviewConfig.InteractionDelay,
): string {
    return `<!DOCTYPE html>
<html>
<head>
    <title>Message Test</title>
</head>
<body>
    <script>
        const vscode = acquireVsCodeApi();
        setTimeout(() => {
            vscode.postMessage({ type: '${messageType}', data: ${JSON.stringify(messageData)} });
        }, ${delay});
    </script>
    <div>Message test webview</div>
</body>
</html>`;
}

/**
 * Create HTML content for interactive webview testing
 */
export function createInteractiveTestHtml(
    title: string = "Interactive Test",
    buttonActions: Array<{ id: string; label: string; messageType: string }> = [],
): string {
    const buttons = buttonActions
        .map(
            action => `
        <button id="${action.id}" onclick="sendMessage('${action.messageType}')">${action.label}</button>
    `,
        )
        .join("");

    return `<!DOCTYPE html>
<html>
<head>
    <title>${title}</title>
    <style>
        body { font-family: var(--vscode-font-family); }
        button { 
            background: var(--vscode-button-background); 
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            margin: 4px;
            cursor: pointer;
        }
        .result { margin-top: 10px; }
    </style>
</head>
<body>
    <h2>${title}</h2>
    ${buttons}
    <div class="result" id="result">Ready for testing</div>
    
    <script>
        const vscode = acquireVsCodeApi();
        
        function sendMessage(type) {
            vscode.postMessage({ 
                type: type, 
                data: { action: type, timestamp: Date.now() }
            });
        }
        
        // Listen for messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'updateResult') {
                document.getElementById('result').textContent = message.data;
            }
        });
    </script>
</body>
</html>`;
}

/**
 * Test webview with large dataset to verify performance
 */
export function createDataVisualizationHtml(
    data: {
        status: string;
        executionTime: string;
        rowCount: number;
        columns: string[];
        data: Record<string, unknown>[];
        metadata?: Record<string, unknown>;
    },
    maxDisplayRows: number = 10,
): string {
    return `<!DOCTYPE html>
<html>
<head>
    <title>Data Visualization</title>
    <style>
        body { font-family: var(--vscode-font-family); }
        .data-table { border-collapse: collapse; width: 100%; }
        .data-table th, .data-table td { 
            border: 1px solid var(--vscode-panel-border); 
            padding: 8px; 
            text-align: left; 
        }
        .data-table th { background: var(--vscode-editor-background); }
        .summary { margin-bottom: 20px; padding: 10px; }
        .metadata { margin-top: 20px; font-size: 0.9em; }
    </style>
</head>
<body>
    <div class="summary">
        <h2>Query Results</h2>
        <p>Status: <span id="status">${data.status}</span></p>
        <p>Execution Time: <span id="execTime">${data.executionTime}</span></p>
        <p>Row Count: <span id="rowCount">${data.rowCount}</span></p>
    </div>
    
    <table class="data-table">
        <thead>
            <tr>
                ${data.columns.map(col => `<th>${col}</th>`).join("")}
            </tr>
        </thead>
        <tbody>
            ${data.data
                .slice(0, maxDisplayRows)
                .map(
                    row => `
                <tr>
                    ${data.columns.map(col => `<td>${row[col] || ""}</td>`).join("")}
                </tr>
            `,
                )
                .join("")}
        </tbody>
    </table>
    
    ${
        data.metadata
            ? `<div class="metadata">
        <h3>Metadata</h3>
        ${Object.entries(data.metadata)
            .map(([key, value]) => `<p>${key}: ${value}</p>`)
            .join("")}
    </div>`
            : ""
    }
    
    <script>
        const vscode = acquireVsCodeApi();
        // Notify extension that rendering is complete
        vscode.postMessage({ 
            type: 'renderComplete', 
            data: { 
                rowsDisplayed: Math.min(${maxDisplayRows}, ${data.data.length}),
                totalRows: ${data.data.length}
            }
        });
    </script>
</body>
</html>`;
}

/**
 * Assert that a webview panel has correct configuration
 */
export function assertWebviewPanelConfiguration(
    panel: vscode.WebviewPanel,
    expectedViewType: string,
    expectedTitle?: string,
): void {
    assert.ok(panel, "Webview panel should be created");
    assert.strictEqual(panel.viewType, expectedViewType, "Panel should have correct view type");

    if (expectedTitle) {
        assert.strictEqual(panel.title, expectedTitle, "Panel should have correct title");
    }

    assert.ok(panel.webview.options.enableScripts, "Webview should allow scripts");
}

/**
 * Test webview disposal and cleanup
 */
export function testWebviewDisposal(panel: vscode.WebviewPanel): Promise<boolean> {
    return new Promise(resolve => {
        let disposalEventFired = false;

        panel.onDidDispose(() => {
            disposalEventFired = true;
            resolve(disposalEventFired);
        });

        panel.dispose();
    });
}

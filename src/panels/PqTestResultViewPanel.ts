/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as vscode from "vscode";
import { Webview, WebviewPanel, WebviewPanelOnDidChangeViewStateEvent } from "vscode";

import { Disposable, IDisposable } from "../common/Disposable";
import { ExtractValueEventEmitterTypes, ValueEventEmitter } from "../common/ValueEventEmitter";
import { ExtensionConfigurations } from "../constants/PowerQuerySdkConfiguration";
import { extensionI18n } from "../i18n/extension";

const PqTestResultViewPanelPrefix: string = `powerquery.sdk.tools`;

// eslint-disable-next-line @typescript-eslint/typedef
const SimpleBrokerValues = Object.freeze({
    locale: new ValueEventEmitter<string>(ExtensionConfigurations.pqLocale),
    activeColorTheme: new ValueEventEmitter<vscode.ColorTheme>(vscode.window.activeColorTheme),
    // eslint-disable-next-line security/detect-object-injection, @typescript-eslint/no-explicit-any
    latestPqTestResult: new ValueEventEmitter<any>(undefined),
});

type SimplePqTestResultViewBrokerValues = ExtractValueEventEmitterTypes<typeof SimpleBrokerValues>;
// todo replace this SimplePqTestResultViewBroker with a more fancy one
export class SimplePqTestResultViewBroker {
    public static values: Readonly<Record<SimplePqTestResultViewBrokerValues, ValueEventEmitter>> = SimpleBrokerValues;
    public static activate(): void {
        vscode.window.onDidChangeActiveColorTheme((nextColor: vscode.ColorTheme) => {
            this.values.activeColorTheme.emit(nextColor);
        });

        for (const oneProperty in this.values) {
            // eslint-disable-next-line security/detect-object-injection, @typescript-eslint/no-explicit-any
            this.values[oneProperty as SimplePqTestResultViewBrokerValues].subscribe((nextValue: any) => {
                PqTestResultViewPanel.currentPanel?.postOneMessage("OnOneValueUpdated", {
                    property: oneProperty,
                    value: nextValue,
                });
            });
        }
    }
    public static emitAll(): void {
        for (const oneProperty in this.values) {
            // eslint-disable-next-line security/detect-object-injection
            this.values[oneProperty as SimplePqTestResultViewBrokerValues].emit();
        }
    }
    public static deActivate(): void {
        for (const oneProperty in this.values) {
            // eslint-disable-next-line security/detect-object-injection
            this.values[oneProperty as SimplePqTestResultViewBrokerValues].dispose();
        }
    }
    // noinspection JSUnusedLocalSymbols
    private constructor() {
        // noop
    }
}

const isDevWebView: boolean = process.env.WEBVIEW_DEV_MODE === "true";

export class PqTestResultViewPanel implements IDisposable {
    // commands
    public static readonly ShowResultWebViewCommand: string = `${PqTestResultViewPanelPrefix}.ShowResultWebView`;
    public static readonly UpdateResultWebViewCommand: string = `${PqTestResultViewPanelPrefix}.UpdateResultWebView`;
    // view constants
    public static readonly viewType: string = `${PqTestResultViewPanelPrefix}.ResultWebView`;
    public static readonly viewPaths: string[] = ["webviewDist", "pq-test-result-view"];

    public static currentPanel?: PqTestResultViewPanel;

    public static getWebviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
        return {
            // Enable javascript in the webview
            enableScripts: true,
            // retainContextWhenHidden: true,
            // And restrict the webview to only loading content from our extension's `main` directory.
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, ...PqTestResultViewPanel.viewPaths)],
        };
    }

    public static activate(vscExtCtx: vscode.ExtensionContext): IDisposable {
        vscExtCtx.subscriptions.push(
            vscode.commands.registerCommand(PqTestResultViewPanel.ShowResultWebViewCommand, () => {
                PqTestResultViewPanel.createOrShow(vscExtCtx.extensionUri);
            }),
        );

        vscExtCtx.subscriptions.push(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            vscode.commands.registerCommand(PqTestResultViewPanel.UpdateResultWebViewCommand, (nextResult: any) => {
                PqTestResultViewPanel.createOrShow(vscExtCtx.extensionUri);
                SimplePqTestResultViewBroker.values.latestPqTestResult.emit(nextResult);
            }),
        );

        if (vscode.window.registerWebviewPanelSerializer) {
            // Make sure we register a serializer in activation event
            vscode.window.registerWebviewPanelSerializer(PqTestResultViewPanel.viewType, {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any,require-await
                async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, _state: any) {
                    // console.log(`Got state: ${state}`);
                    // Reset the webview options so we use latest uri for `localResourceRoots`.
                    webviewPanel.webview.options = PqTestResultViewPanel.getWebviewOptions(vscExtCtx.extensionUri);
                    PqTestResultViewPanel.revive(webviewPanel, vscExtCtx.extensionUri);
                },
            });
        }

        SimplePqTestResultViewBroker.activate();

        return new Disposable(() => {
            SimplePqTestResultViewBroker.deActivate();
        });
    }

    public static createOrShow(extensionUri: vscode.Uri): void {
        // const column: ViewColumn | undefined = vscode.window.activeTextEditor?.viewColumn ?? undefined;
        if (this.currentPanel) {
            // reveal currentPanel to current column
            this.currentPanel._panel.reveal();

            return;
        }

        // Otherwise, create a new panel. workbench.action.editorLayoutTwoColumns
        void vscode.commands.executeCommand("workbench.action.editorLayoutTwoColumns");

        const panel: WebviewPanel = vscode.window.createWebviewPanel(
            PqTestResultViewPanel.viewType,
            extensionI18n["PQTest.result.view.title"],
            vscode.ViewColumn.Beside,
            PqTestResultViewPanel.getWebviewOptions(extensionUri),
        );

        this.currentPanel = new PqTestResultViewPanel(panel, extensionUri);
    }

    public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri): void {
        this.currentPanel = new PqTestResultViewPanel(panel, extensionUri);
    }

    private _disposables: IDisposable[] = [];

    constructor(private readonly _panel: vscode.WebviewPanel, private readonly _extensionUri: vscode.Uri) {
        this._update();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Update the content based on view changes
        this._panel.onDidChangeViewState(
            (_e: WebviewPanelOnDidChangeViewStateEvent) => {
                if (this._panel.visible) {
                    this._update();
                }
            },
            null,
            this._disposables,
        );

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (message: any) => {
                switch (message.type) {
                    case "onReady":
                        SimplePqTestResultViewBroker.emitAll();
                }
            },
            null,
            this._disposables,
        );
    }

    _update(): void {
        // noop
        this._panel.title = extensionI18n["PQTest.result.view.title"];

        this._panel.webview.html = isDevWebView
            ? this._getDevHtmlForWebview(this._panel.webview)
            : this._getHtmlForWebview(this._panel.webview);
    }

    dispose(): void {
        PqTestResultViewPanel.currentPanel = undefined;
        this._panel.dispose();

        while (this._disposables.length) {
            const disposable: IDisposable | undefined = this._disposables.pop();

            if (disposable) {
                disposable.dispose();
            }
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public postOneMessage(type: string, payload: any): void {
        void this._panel.webview.postMessage({
            type,
            payload,
        });
    }

    private _getHtmlForWebview(webview: Webview): string {
        // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
        const baseUri: vscode.Uri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, ...PqTestResultViewPanel.viewPaths),
        );

        const scriptUri: vscode.Uri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, ...PqTestResultViewPanel.viewPaths, "main.js"),
        );

        return `<!DOCTYPE html>
			<html lang="en">
			<head>
			    <base href="${baseUri}/">
				<meta charset="UTF-8">

				<!--
					Use a content security policy to only allow loading images from https or from our extension directory,
					and only allow scripts that have a specific nonce.
				-->

				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				
				<title>${extensionI18n["PQTest.result.view.title"]}</title>
			</head>
			<body>
        <div id="root"></div>
				<script src="${scriptUri}"></script>
			</body>
			</html>`;
    }

    private _getDevHtmlForWebview(webview: Webview): string {
        // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
        const baseUri: vscode.Uri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, ...PqTestResultViewPanel.viewPaths),
        );

        return `<!DOCTYPE html>
          <html lang="en">
          <head>
            <base href="${baseUri}/">
            <meta charset="UTF-8">
    
            <!--
              Use a content security policy to only allow loading images from https or from our extension directory,
              and only allow scripts that have a specific nonce.
            -->
    
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            
            <title>${extensionI18n["PQTest.result.view.title"]}</title>
            <script defer src="http://localhost:3001/main.js"></script>
          </head>
          <body>
            <div id="root"></div>
          </body>
			</html>`;
    }
}

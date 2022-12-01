/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as Net from "net";
import * as vscode from "vscode";
import { join } from "path";
import { platform } from "process";
import { randomBytes } from "crypto";
import { Socket } from "net";
import { tmpdir } from "os";

import { CancellationToken, DebugConfiguration, ProviderResult, TextEditor, WorkspaceFolder } from "vscode";

import { ExtensionConstants } from "../constants/PowerQuerySdkExtension";
import { extensionI18n } from "../i18n/extension";
import { IDisposable } from "../common/Disposable";
import { MQueryDebugSession } from "./MQueryDebugSession";

class MQueryConfigurationProvider implements vscode.DebugConfigurationProvider {
    /**
     * Massage a debug configuration just before a debug session is being launched,
     * e.g. add all missing attributes to the debug configuration.
     */
    resolveDebugConfiguration(
        folder: WorkspaceFolder | undefined,
        config: DebugConfiguration,
        _token?: CancellationToken,
    ): ProviderResult<DebugConfiguration> {
        // if launch.json is missing or empty
        if (!config.type && !config.request && !config.name) {
            const editor: TextEditor | undefined = vscode.window.activeTextEditor;

            if (editor?.document.languageId === ExtensionConstants.PQLanguageId) {
                config.type = ExtensionConstants.PQDebugType;
                config.name = "Launch";
                config.request = "launch";
                config.program = "${file}";
            }
        }

        if (!config.program) {
            return vscode.window.showInformationMessage(extensionI18n["PQSdk.debugger.error.cannot.find.program"]).then(
                (_: string | undefined) => undefined, // abort launch
            );
        }

        return config;
    }
}

class InlineDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {
    createDebugAdapterDescriptor(_session: vscode.DebugSession): ProviderResult<vscode.DebugAdapterDescriptor> {
        return new vscode.DebugAdapterInlineImplementation(new MQueryDebugSession());
    }
}

class MQueryNodeDebugAdapterNamedPipeServerDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {
    private server?: Net.Server;

    createDebugAdapterDescriptor(
        _session: vscode.DebugSession,
        _executable: vscode.DebugAdapterExecutable | undefined,
    ): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
        if (!this.server) {
            // start listening on a random named pipe path
            const pipeName: string = randomBytes(10).toString("utf8");
            const pipePath: string = platform === "win32" ? join("\\\\.\\pipe\\", pipeName) : join(tmpdir(), pipeName);

            this.server = Net.createServer((socket: Socket) => {
                const session: MQueryDebugSession = new MQueryDebugSession();
                session.setRunAsServer(true);
                session.start(socket as NodeJS.ReadableStream, socket);
            }).listen(pipePath);
        }

        // make VS Code connect to debug server
        return new vscode.DebugAdapterNamedPipeServer(this.server.address() as string);
    }

    dispose(): void {
        if (this.server) {
            this.server.close();
        }
    }
}

export function activateMQueryDebug(vscExtCtx: vscode.ExtensionContext, mode: "inline" | "server"): void {
    vscExtCtx.subscriptions.push(
        vscode.commands.registerCommand(
            `${ExtensionConstants.ConfigNames.PowerQuerySdk.name}.getMQueryFileName`,
            async (_config: unknown) => {
                const allPqTestFiles: vscode.Uri[] = await vscode.workspace.findFiles(
                    "*.{query.pq,test.pq}",
                    null,
                    1e2,
                );

                return vscode.window.showQuickPick(
                    allPqTestFiles.map((oneUrl: vscode.Uri) => vscode.workspace.asRelativePath(oneUrl, false)),
                );
            },
        ),
    );

    const provider: MQueryConfigurationProvider = new MQueryConfigurationProvider();

    vscExtCtx.subscriptions.push(
        vscode.debug.registerDebugConfigurationProvider(ExtensionConstants.PQDebugType, provider),
    );

    const factory: vscode.DebugAdapterDescriptorFactory =
        mode === "server"
            ? new MQueryNodeDebugAdapterNamedPipeServerDescriptorFactory()
            : new InlineDebugAdapterFactory();

    vscExtCtx.subscriptions.push(
        vscode.debug.registerDebugAdapterDescriptorFactory(ExtensionConstants.PQDebugType, factory),
    );

    if ("dispose" in factory) {
        vscExtCtx.subscriptions.push(factory as unknown as IDisposable);
    }
}

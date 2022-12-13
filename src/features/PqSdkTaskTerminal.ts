/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as os from "os";
import * as vscode from "vscode";

import { DISCONNECTED, PqServiceHostClientLight, READY } from "../pqTestConnector/PqServiceHostClientLight";
import { extensionI18n, resolveI18nTemplate } from "../i18n/extension";
import { ExtensionInfo, GenericResult } from "../common/PQTestService";
import { fromEvents } from "../common/promises/fromEvents";
import { PowerQueryTaskDefinition } from "../common/PowerQueryTask";
import { resolveSubstitutedValues } from "../utils/vscodes";
import { stringifyJson } from "../utils/strings";

export class PqSdkTaskTerminal implements vscode.Pseudoterminal {
    public static LineFeed: string = os.platform() === "win32" ? "\r\n" : "\n";
    public static getTaskForPQTestTaskDefinition(taskDefinition: PowerQueryTaskDefinition): vscode.Task {
        return new vscode.Task(
            taskDefinition,
            vscode.TaskScope.Workspace,
            taskDefinition.label ?? taskDefinition.operation,
            taskDefinition.type,
            new vscode.CustomExecution(() => Promise.resolve(new PqSdkTaskTerminal(taskDefinition))),
        );
    }

    private readonly pqServiceHostClientLight: PqServiceHostClientLight;
    private writeEmitter: vscode.EventEmitter<string> = new vscode.EventEmitter<string>();
    onDidWrite: vscode.Event<string> = this.writeEmitter.event;
    private readonly closeEmitter: vscode.EventEmitter<number> = new vscode.EventEmitter<number>();
    onDidClose?: vscode.Event<number> = this.closeEmitter.event;

    constructor(private readonly taskDefinition: PowerQueryTaskDefinition) {
        // noop
        this.pqServiceHostClientLight = new PqServiceHostClientLight(this);
    }

    close(): void {
        // noop
        this.pqServiceHostClientLight.dispose();
    }

    async open(_initialDimensions: vscode.TerminalDimensions | undefined): Promise<void> {
        // activate pqServiceHostClientLight and make it connect to pqServiceHost
        this.pqServiceHostClientLight.onPowerQueryTestLocationChanged();

        try {
            // wait for the pqServiceHostClientLight's socket got ready
            await fromEvents(this.pqServiceHostClientLight, [READY], [DISCONNECTED]);

            switch (this.taskDefinition.operation) {
                case "list-credential": {
                    const result: unknown[] = await this.pqServiceHostClientLight.ListCredentials();

                    this.appendInfoLine(
                        resolveI18nTemplate("PQSdk.lifecycle.command.list.credentials.result", {
                            result: stringifyJson(result),
                        }),
                    );

                    break;
                }

                case "delete-credential": {
                    const deleteCredentialResult: GenericResult =
                        await this.pqServiceHostClientLight.DeleteCredential();

                    this.appendInfoLine(deleteCredentialResult.Message);
                    break;
                }

                case "info": {
                    const displayExtensionInfoResult: ExtensionInfo[] =
                        await this.pqServiceHostClientLight.DisplayExtensionInfo();

                    this.appendInfoLine(
                        resolveI18nTemplate("PQSdk.lifecycle.command.display.extension.info.result", {
                            result: displayExtensionInfoResult
                                .map((info: ExtensionInfo) => info.Name ?? "")
                                .filter(Boolean)
                                .join(","),
                        }),
                    );

                    break;
                }

                case "set-credential": {
                    if (this.taskDefinition.credentialTemplate) {
                        const setCredentialGenericResult: GenericResult =
                            await this.pqServiceHostClientLight.SetCredential(
                                JSON.stringify(this.taskDefinition.credentialTemplate),
                            );

                        this.appendInfoLine(
                            resolveI18nTemplate("PQSdk.lifecycle.command.set.credentials.result", {
                                result: stringifyJson(setCredentialGenericResult),
                            }),
                        );
                    } else {
                        this.appendErrorLine(
                            extensionI18n["PQSdk.lifecycle.command.set.credentials.template.missing.errorMessage"],
                        );
                    }

                    break;
                }

                case "refresh-credential": {
                    const refreshCredentialResult: GenericResult =
                        await this.pqServiceHostClientLight.RefreshCredential();

                    this.appendInfoLine(
                        resolveI18nTemplate("PQSdk.lifecycle.command.refresh.credentials.result", {
                            result: stringifyJson(refreshCredentialResult),
                        }),
                    );

                    break;
                }

                case "run-test": {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const result: any = await this.pqServiceHostClientLight.RunTestBatteryFromContent(
                        resolveSubstitutedValues(this.taskDefinition.pathToQueryFile),
                    );

                    this.appendInfoLine(
                        resolveI18nTemplate("PQSdk.lifecycle.command.run.test.result", {
                            result: stringifyJson(result),
                        }),
                    );

                    break;
                }

                case "test-connection": {
                    const testConnectionResult: GenericResult = await this.pqServiceHostClientLight.TestConnection();

                    this.appendInfoLine(
                        resolveI18nTemplate("PQSdk.lifecycle.command.test.connection.result", {
                            result: stringifyJson(testConnectionResult),
                        }),
                    );

                    break;
                }

                default:
                    break;
            }

            this.closeEmitter.fire(0);
        } catch (e) {
            // / noop
            if (e instanceof Error || typeof e === "string") {
                this.appendErrorLine(e.toString());
            }

            this.closeEmitter.fire(-1);
            this.pqServiceHostClientLight.dispose();
        }
    }

    appendLine(value: string): void {
        this.writeEmitter.fire(value + PqSdkTaskTerminal.LineFeed);
    }

    public appendLineWithTimeStamp(line: string): void {
        const now: Date = new Date();
        this.appendLine(`[${now.toLocaleTimeString()}]\t${line}`);
    }

    public appendInfoLine(value: string): void {
        this.appendLineWithTimeStamp(`[${extensionI18n["PQSdk.common.logLevel.Info"]}]\t${value}`);
    }

    public appendErrorLine(value: string): void {
        this.appendLineWithTimeStamp(`[${extensionI18n["PQSdk.common.logLevel.Error"]}]\t${value}`);
    }
}

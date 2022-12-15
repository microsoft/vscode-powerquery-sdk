/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as path from "path";
import {
    InitializedEvent,
    logger,
    Logger,
    LoggingDebugSession,
    OutputEvent,
    Source,
    TerminatedEvent,
} from "@vscode/debugadapter";
import { DebugProtocol } from "@vscode/debugprotocol";

import { DISCONNECTED, PqServiceHostClientLite, READY } from "../pqTestConnector/PqServiceHostClientLite";
import { extensionI18n, resolveI18nTemplate } from "../i18n/extension";
import { ExtensionInfo, GenericResult } from "../common/PQTestService";
import {
    PqTestExecutableOnceTask,
    PqTestExecutableOnceTaskQueueEvents,
} from "../pqTestConnector/PqTestExecutableOnceTask";
import { DeferredValue } from "../common/DeferredValue";
import { ExtensionConfigurations } from "../constants/PowerQuerySdkConfiguration";
import { fromEvents } from "../common/promises/fromEvents";
import { stringifyJson } from "../utils/strings";
import { WaitNotify } from "../common/WaitNotify";

/**
 * This interface describes the mock-debug specific launch attributes
 * (which are not part of the Debug Adapter Protocol).
 * The schema for these attributes lives in the package.json of the mock-debug extension.
 * The interface should always match this schema.
 */
interface ILaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
    /** An absolute path to the "program" to debug. */
    readonly program: string;
    /** enable logging the Debug Adapter Protocol */
    readonly trace?: boolean;
    /** pqtest operation parameter */
    readonly operation?: string;
    /** optional additional arguments for the current operation*/
    readonly additionalArgs?: string[];
    /** optional standard input of the current operation*/
    readonly stdinStr?: string;
}

export class MQueryDebugSession extends LoggingDebugSession {
    private readonly configurationDone: WaitNotify = new WaitNotify();
    private readonly processForked: DeferredValue<boolean> = new DeferredValue<boolean>(false);
    private readonly pqTestExecutableOnceTask?: PqTestExecutableOnceTask;
    private readonly pqServiceHostClientLite?: PqServiceHostClientLite;
    private readonly useServiceHost: boolean;
    private currentProgram: string = "";
    private isTerminated: boolean = false;

    constructor() {
        super();
        this.setDebuggerLinesStartAt1(false);
        this.setDebuggerColumnsStartAt1(false);

        this.useServiceHost = ExtensionConfigurations.featureUseServiceHost;

        if (this.useServiceHost) {
            this.pqServiceHostClientLite = new PqServiceHostClientLite(this);
        } else {
            this.pqTestExecutableOnceTask = new PqTestExecutableOnceTask();

            this.pqTestExecutableOnceTask.eventBus.on(PqTestExecutableOnceTaskQueueEvents.processCreated, () => {
                this.processForked.resolve(true);
            });

            this.pqTestExecutableOnceTask.eventBus.on(
                PqTestExecutableOnceTaskQueueEvents.onOutput,
                (type: "stdOutput" | "stdError", text: string) => {
                    let category: string;

                    switch (type) {
                        case "stdOutput":
                            category = "stdout";
                            break;
                        case "stdError":
                            category = "stderr";
                            break;
                        default:
                            category = "console";
                            break;
                    }

                    const e: DebugProtocol.OutputEvent = new OutputEvent(`${text}\n`, category);
                    const maybePathToQueryFile: string = this.pqTestExecutableOnceTask?.pathToQueryFile ?? "";

                    if (maybePathToQueryFile) {
                        e.body.source = this.createSource(maybePathToQueryFile);
                    }

                    this.sendEvent(e);
                },
            );

            this.pqTestExecutableOnceTask.eventBus.on(PqTestExecutableOnceTaskQueueEvents.processExited, () => {
                this.sendEvent(new TerminatedEvent());

                setTimeout(() => {
                    this.pqTestExecutableOnceTask?.dispose();
                }, 0);
            });
        }
    }

    /**
     * The 'initialize' request is the first request called by the frontend
     * to interrogate the features the debug adapter provides.
     */
    protected override initializeRequest(
        response: DebugProtocol.InitializeResponse,
        _args: DebugProtocol.InitializeRequestArguments,
    ): void {
        // build and return the capabilities of this debug adapter:
        response.body = response.body || {};

        // the adapter implements the configurationDone request.
        response.body.supportsConfigurationDoneRequest = true;

        // The debug adapter supports the 'loadedSources' request.
        response.body.supportsLoadedSourcesRequest = true;

        this.sendResponse(response);

        // since this debug adapter can accept configuration requests like 'setBreakpoint' at any time,
        // we request them early by sending an 'initializeRequest' to the frontend.
        // The frontend will end the configuration sequence by calling 'configurationDone' request.
        this.sendEvent(new InitializedEvent());
    }

    /**
     * Called at the end of the configuration sequence.
     * Indicates that all breakpoints etc. have been sent to the DA and that the 'launch' can start.
     */
    protected override configurationDoneRequest(
        response: DebugProtocol.ConfigurationDoneResponse,
        args: DebugProtocol.ConfigurationDoneArguments,
    ): void {
        super.configurationDoneRequest(response, args);
        // notify the launchRequest that configuration has finished
        this.configurationDone.notify();
    }

    protected override async launchRequest(
        response: DebugProtocol.LaunchResponse,
        args: ILaunchRequestArguments,
    ): Promise<void> {
        // make sure to 'Stop' the buffered logging if 'trace' is not set
        logger.setup(args.trace ? Logger.LogLevel.Verbose : Logger.LogLevel.Stop, false);

        // wait 1 second until configuration has finished (and configurationDoneRequest has been called)
        await this.configurationDone.wait(2e3);

        this.currentProgram = args.program;

        if (this.useServiceHost) {
            void this.doLaunchRequest(args);
        } else {
            // start the program in the runtime, do not await here
            void this.pqTestExecutableOnceTask?.run(args.program, {
                operation: args.operation ?? "run-test",
                additionalArgs: args.additionalArgs,
            });
        }

        this.sendResponse(response);
    }

    private async doLaunchRequest(args: ILaunchRequestArguments): Promise<void> {
        if (this.useServiceHost && this.pqServiceHostClientLite) {
            // activate pqServiceHostClientLite and make it connect to pqServiceHost
            this.pqServiceHostClientLite.onPowerQueryTestLocationChanged();

            try {
                // wait for the pqServiceHostClientLite's socket got ready
                await fromEvents(this.pqServiceHostClientLite, [READY], [DISCONNECTED]);

                const theOperation: string = args.operation ?? "run-test";

                switch (theOperation) {
                    case "info": {
                        const displayExtensionInfoResult: ExtensionInfo[] =
                            await this.pqServiceHostClientLite.DisplayExtensionInfo();

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

                    case "test-connection": {
                        const testConnectionResult: GenericResult = await this.pqServiceHostClientLite.TestConnection();

                        this.appendInfoLine(
                            resolveI18nTemplate("PQSdk.lifecycle.command.test.connection.result", {
                                result: stringifyJson(testConnectionResult),
                            }),
                        );

                        break;
                    }

                    case "run-test": {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const result: any = await this.pqServiceHostClientLite.RunTestBatteryFromContent(
                            path.resolve(args.program),
                        );

                        this.appendInfoLine(
                            resolveI18nTemplate("PQSdk.lifecycle.command.run.test.result", {
                                result: stringifyJson(result),
                            }),
                        );

                        break;
                    }

                    default:
                        break;
                }
            } catch (e) {
                // / noop
                if (e instanceof Error || typeof e === "string") {
                    this.appendErrorLine(e.toString());
                }

                this.pqServiceHostClientLite.dispose();
            }

            this.sendEvent(new TerminatedEvent());
            this.pqServiceHostClientLite.dispose();
        }
    }

    protected override async loadedSourcesRequest(
        response: DebugProtocol.LoadedSourcesResponse,
        _args: DebugProtocol.LoadedSourcesArguments,
        _request?: DebugProtocol.Request,
    ): Promise<void> {
        await this.processForked.deferred$;

        response.body = {
            sources: [this.createSource(this.pqTestExecutableOnceTask?.pathToQueryFile ?? "")],
        };

        this.isTerminated = true;
        this.sendResponse(response);
    }

    private createSource(filePath: string): Source {
        return new Source(path.dirname(filePath), this.convertDebuggerPathToClient(filePath), undefined, undefined);
    }

    appendLine(value: string, category: "stdout" | "stderr" | "console" = "stdout"): void {
        const e: DebugProtocol.OutputEvent = new OutputEvent(`${this.prefixLineWithTimeStamp(value)}\n`, category);

        if (this.currentProgram) {
            e.body.source = this.createSource(path.resolve(this.currentProgram));
        }

        this.sendEvent(e);
    }

    private prefixLineWithTimeStamp(line: string): string {
        const now: Date = new Date();

        return `[${now.toLocaleTimeString()}]\t${line}`;
    }

    public appendInfoLine(value: string): void {
        this.appendLine(`[${extensionI18n["PQSdk.common.logLevel.Info"]}]\t${value}`);
    }

    public appendErrorLine(value: string): void {
        Boolean(!this.isTerminated) ||
            this.appendLine(`[${extensionI18n["PQSdk.common.logLevel.Error"]}]\t${value}`, "stderr");
    }
}

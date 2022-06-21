/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as path from "path";
import {
    InitializedEvent,
    Logger,
    logger,
    LoggingDebugSession,
    OutputEvent,
    Source,
    TerminatedEvent,
} from "@vscode/debugadapter";
import { DebugProtocol } from "@vscode/debugprotocol";

import {
    PqTestExecutableOnceTask,
    PqTestExecutableOnceTaskQueueEvents,
} from "pqTestConnector/PqTestExecutableOnceTask";
import { WaitNotify } from "common/WaitNotify";

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
    private readonly _configurationDone: WaitNotify = new WaitNotify();
    private readonly _pqTestExecutableOnceTask: PqTestExecutableOnceTask;

    constructor() {
        super();
        this.setDebuggerLinesStartAt1(false);
        this.setDebuggerColumnsStartAt1(false);
        this._pqTestExecutableOnceTask = new PqTestExecutableOnceTask();

        this._pqTestExecutableOnceTask.eventBus.on(
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
                const maybePathToQueryFile: string = this._pqTestExecutableOnceTask.pathToQueryFile;

                if (maybePathToQueryFile) {
                    e.body.source = this.createSource(this._pqTestExecutableOnceTask.pathToQueryFile);
                }

                this.sendEvent(e);
            },
        );

        this._pqTestExecutableOnceTask.eventBus.on(PqTestExecutableOnceTaskQueueEvents.processExited, () => {
            this.sendEvent(new TerminatedEvent());

            setTimeout(() => {
                this._pqTestExecutableOnceTask.dispose();
            }, 0);
        });
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
        this._configurationDone.notify();
    }

    protected override async launchRequest(
        response: DebugProtocol.LaunchResponse,
        args: ILaunchRequestArguments,
    ): Promise<void> {
        // make sure to 'Stop' the buffered logging if 'trace' is not set
        logger.setup(args.trace ? Logger.LogLevel.Verbose : Logger.LogLevel.Stop, false);

        // wait 1 second until configuration has finished (and configurationDoneRequest has been called)
        await this._configurationDone.wait(1e3);

        // start the program in the runtime, do not await here
        void this._pqTestExecutableOnceTask.run(args.program, {
            operation: args.operation ?? "run-test",
            additionalArgs: args.additionalArgs,
        });

        this.sendResponse(response);
    }

    private createSource(filePath: string): Source {
        return new Source(path.dirname(filePath), this.convertDebuggerPathToClient(filePath), undefined, undefined);
    }
}

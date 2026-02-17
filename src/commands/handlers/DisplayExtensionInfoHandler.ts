/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { ExtensionInfo, IPQTestService } from "../../common/PQTestService";
import { CommandResult, ICommandHandler } from "./ICommandHandler";

/**
 * Configuration for DisplayExtensionInfoHandler
 */
export interface DisplayExtensionInfoConfig {
    featureUseServiceHost: boolean;
}

/**
 * Parameters for DisplayExtensionInfo command
 */
export type DisplayExtensionInfoParams = Record<string, never>;

/**
 * Result data for DisplayExtensionInfo command
 */
export interface DisplayExtensionInfoResult {
    extensions: ExtensionInfo[];
    displayText: string;
}

/**
 * Handler for displaying extension information
 * Contains pure business logic that can be unit tested
 */
export class DisplayExtensionInfoHandler
    implements ICommandHandler<DisplayExtensionInfoParams, CommandResult<DisplayExtensionInfoResult>>
{
    constructor(
        private readonly pqTestService: IPQTestService,
        private readonly config: DisplayExtensionInfoConfig = { featureUseServiceHost: false },
    ) {}

    /**
     * Execute the display extension info logic
     * @param _params Command parameters (unused for this command)
     * @returns Promise with command result containing extension info
     */
    public async execute(_params: DisplayExtensionInfoParams): Promise<CommandResult<DisplayExtensionInfoResult>> {
        try {
            const result: ExtensionInfo[] = await this.pqTestService.DisplayExtensionInfo();

            const displayText: string = result
                .map((info: ExtensionInfo) => info.Name ?? "")
                .filter(Boolean)
                .join(",");

            return {
                success: true,
                data: {
                    extensions: result,
                    displayText,
                },
            };
        } catch (error: unknown) {
            return this.handleError(error);
        }
    }

    /**
     * Handle errors from the PQTest service
     * @param error The error that occurred
     * @returns Command result with error information
     */
    private handleError(error: unknown): CommandResult<DisplayExtensionInfoResult> {
        // Check if this is an ignorable service host error
        if (this.isIgnorableServiceHostError(error)) {
            return {
                success: true,
                data: {
                    extensions: [],
                    displayText: "",
                },
            };
        }

        const errorMessage: string = error instanceof Error && error.message ? error.message : String(error);

        return {
            success: false,
            error: errorMessage,
        };
    }

    /**
     * Determine if this is a service host error that can be ignored
     * @param error The error to check
     * @returns True if the error can be ignored
     */
    private isIgnorableServiceHostError(error: unknown): boolean {
        // Check for service host specific errors based on error message or type
        // without importing the specific classes to avoid vscode dependency
        if (
            this.config.featureUseServiceHost &&
            this.hasServiceHostDisconnected() &&
            this.isPqServiceHostServerNotReadyError(error)
        ) {
            return true;
        }

        return false;
    }

    /**
     * Check if the service host is disconnected
     * @returns True if service host is disconnected
     */
    private hasServiceHostDisconnected(): boolean {
        // Check if the service implements the pqServiceHostConnected property
        const serviceHostClient: IPQTestService & { pqServiceHostConnected?: boolean } = this
            .pqTestService as IPQTestService & { pqServiceHostConnected?: boolean };

        return serviceHostClient.pqServiceHostConnected === false;
    }

    /**
     * Check if the error is a PqServiceHostServerNotReady error
     * @param error The error to check
     * @returns True if it's a PqServiceHostServerNotReady error
     */
    private isPqServiceHostServerNotReadyError(error: unknown): boolean {
        // Check error type by constructor name to avoid importing the class
        return error?.constructor?.name === "PqServiceHostServerNotReady";
    }
}

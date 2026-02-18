/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { IPQTestService } from "../../common/PQTestService";
import { CommandResult, ICommandHandler } from "./ICommandHandler";

/**
 * Parameters for ListCredentials command
 */
export type ListCredentialsParams = Record<string, never>;

/**
 * Result data for ListCredentials command
 */
export interface ListCredentialsResult {
    credentials: unknown[];
    formattedOutput: string;
}

/**
 * Handler for listing credentials
 * Contains pure business logic that can be unit tested
 */
export class ListCredentialsHandler
    implements ICommandHandler<ListCredentialsParams, CommandResult<ListCredentialsResult>>
{
    constructor(private readonly pqTestService: IPQTestService) {}

    /**
     * Execute the list credentials logic
     * @param _params Command parameters (unused for this command)
     * @returns Promise with command result containing credentials list
     */
    public async execute(_params: ListCredentialsParams): Promise<CommandResult<ListCredentialsResult>> {
        try {
            const credentials: unknown[] = await this.pqTestService.ListCredentials();
            const formattedOutput: string = this.formatCredentials(credentials);

            return {
                success: true,
                data: {
                    credentials,
                    formattedOutput,
                },
            };
        } catch (error: unknown) {
            return this.handleError(error);
        }
    }

    /**
     * Format credentials for display
     * @param credentials The credentials to format
     * @returns Formatted string representation
     */
    private formatCredentials(credentials: unknown[]): string {
        return this.prettifyJson(credentials);
    }

    /**
     * Convert object to prettified JSON string
     * @param obj Object to stringify
     * @returns Formatted JSON string
     */
    private prettifyJson(obj: unknown): string {
        return JSON.stringify(obj, null, 2);
    }

    /**
     * Handle errors from the PQTest service
     * @param error The error that occurred
     * @returns Command result with error information
     */
    private handleError(error: unknown): CommandResult<ListCredentialsResult> {
        const errorMessage: string = error instanceof Error ? error.message : String(error);

        return {
            success: false,
            error: errorMessage,
        };
    }
}

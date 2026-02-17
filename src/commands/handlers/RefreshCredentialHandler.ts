/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { GenericResult, IPQTestService } from "../../common/PQTestService";
import { CommandResult, ICommandHandler } from "./ICommandHandler";

/**
 * Parameters for RefreshCredential command
 */
export type RefreshCredentialParams = Record<string, never>;

/**
 * Result data for RefreshCredential command
 */
export interface RefreshCredentialResult {
    result: GenericResult;
    formattedOutput: string;
}

/**
 * Handler for refreshing credentials
 * Contains pure business logic that can be unit tested
 */
export class RefreshCredentialHandler
    implements ICommandHandler<RefreshCredentialParams, CommandResult<RefreshCredentialResult>>
{
    constructor(private readonly pqTestService: IPQTestService) {}

    /**
     * Execute the refresh credential logic
     * @param _params Command parameters (unused for this command)
     * @returns Promise with command result containing refresh result
     */
    public async execute(_params: RefreshCredentialParams): Promise<CommandResult<RefreshCredentialResult>> {
        try {
            const result: GenericResult = await this.pqTestService.RefreshCredential();
            const formattedOutput: string = this.prettifyJson(result);

            return {
                success: true,
                data: {
                    result,
                    formattedOutput,
                },
            };
        } catch (error: unknown) {
            return this.handleError(error);
        }
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
    private handleError(error: unknown): CommandResult<RefreshCredentialResult> {
        const errorMessage: string = error instanceof Error ? error.message : String(error);

        return {
            success: false,
            error: errorMessage,
        };
    }
}

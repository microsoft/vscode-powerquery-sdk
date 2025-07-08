/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

/**
 * Base interface for command handlers that can be unit tested
 */
export interface ICommandHandler<TParams = void, TResult = void> {
    /**
     * Execute the command logic
     * @param params Parameters for the command
     * @returns Promise with command result
     */
    execute(params: TParams): Promise<TResult>;
}

/**
 * Result of a command execution
 */
export interface CommandResult<TData = unknown> {
    success: boolean;
    data?: TData;
    error?: string;
}

/**
 * Parameters for commands that display progress
 */
export interface ProgressCommandParams {
    title?: string;
    cancellable?: boolean;
}

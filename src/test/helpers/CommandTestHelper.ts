/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as assert from "assert";
import * as vscode from "vscode";

import { AcceptableErrorGroups, Timeouts } from "../TestConstants";

export type ErrorGroup = keyof typeof AcceptableErrorGroups;

/**
 * Execute a command with standardized error handling for tests
 */
export async function executeCommandWithErrorHandling(
    commandId: string,
    errorGroup: ErrorGroup = "BasicCommand",
    customAcceptableErrors?: string[],
): Promise<{ success: boolean; error?: string }> {
    try {
        await vscode.commands.executeCommand(commandId);

        return { success: true };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const acceptableErrors = customAcceptableErrors || AcceptableErrorGroups[errorGroup];

        const isAcceptableError = acceptableErrors.some(acceptable =>
            errorMessage.toLowerCase().includes(acceptable.toLowerCase()),
        );

        if (!isAcceptableError) {
            throw error; // Re-throw unexpected errors
        }

        return { success: false, error: errorMessage };
    }
}

/**
 * Assert that a command execution result is acceptable (either succeeds or fails with expected errors)
 */
export function assertCommandExecution(
    result: { success: boolean; error?: string },
    commandId: string,
    expectSuccess = false,
): void {
    if (expectSuccess) {
        assert.ok(result.success, `${commandId} should execute successfully`);
    } else {
        assert.ok(
            result.success || result.error,
            result.success
                ? `${commandId} executed successfully`
                : `${commandId} exists but requires context: ${result.error}`,
        );
    }
}

/**
 * Execute a command safely with timeout and return result for testing
 */
export async function executeCommandSafely(
    commandId: string,
    timeoutMs: number = Timeouts.CommandExecution,
): Promise<{ success: boolean; error?: string; timedOut?: boolean }> {
    try {
        const commandPromise = vscode.commands.executeCommand(commandId);

        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("Command execution timeout")), timeoutMs);
        });

        await Promise.race([commandPromise, timeoutPromise]);

        return { success: true };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const timedOut = errorMessage.includes("timeout");

        return { success: false, error: errorMessage, timedOut };
    }
}

/**
 * Get standard acceptable errors for a command type
 */
export function getStandardAcceptableErrors(errorGroup: ErrorGroup): readonly string[] {
    return AcceptableErrorGroups[errorGroup];
}

/**
 * Check if an error message matches common patterns
 */
export function isCommonError(errorMessage: string, patterns: string[]): boolean {
    return patterns.some(pattern => errorMessage.toLowerCase().includes(pattern.toLowerCase()));
}

/**
 * Test multiple commands with the same error handling pattern
 */
export async function testCommandGroup(
    commands: string[],
    errorGroup: ErrorGroup = "BasicCommand",
    expectAnySuccess = false,
): Promise<{ executed: number; contextErrors: number; unexpected: number }> {
    let executed = 0;
    let contextErrors = 0;
    let unexpected = 0;

    for (const commandId of commands) {
        try {
            const result = await executeCommandWithErrorHandling(commandId, errorGroup);

            if (result.success) {
                executed++;
            } else {
                contextErrors++;
            }
        } catch (error) {
            unexpected++;

            if (!expectAnySuccess) {
                throw error; // Re-throw if we don't expect any successes
            }
        }
    }

    return { executed, contextErrors, unexpected };
}

/**
 * Verify that a command is registered in VS Code
 */
export async function assertCommandIsRegistered(commandId: string): Promise<void> {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes(commandId), `Command '${commandId}' should be registered`);
}

/**
 * Verify multiple commands are registered
 */
export async function assertCommandsAreRegistered(commandIds: string[]): Promise<void> {
    const commands = await vscode.commands.getCommands(true);

    for (const commandId of commandIds) {
        assert.ok(commands.includes(commandId), `Command '${commandId}' should be registered`);
    }
}

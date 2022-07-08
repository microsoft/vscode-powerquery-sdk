/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as vscode from "vscode";

enum InputFlowAction {
    BACK,
    CANCEL,
    RESUME,
}

export type InputStep = (input: MultiStepInput) => Thenable<InputStep | void>;

interface QuickPickParameters<T extends vscode.QuickPickItem> {
    title: string;
    step: number;
    totalSteps: number;
    items: T[];
    activeItem?: T;
    placeholder: string;
    canSelectMany?: boolean;
    buttons?: vscode.QuickInputButton[];
    shouldResume?: () => Thenable<boolean>;
}

interface InputBoxParameters {
    title: string;
    step: number;
    totalSteps: number;
    value: string;
    prompt: string;
    ignoreFocusOut?: boolean;
    password?: boolean;
    validate: (value: string) => Promise<string | undefined>;
    buttons?: vscode.QuickInputButton[];
    shouldResume?: () => Thenable<boolean>;
}

export class MultiStepInput {
    static run(start: InputStep): Promise<void> {
        const input: MultiStepInput = new MultiStepInput();

        return input.stepThrough(start);
    }

    private current?: vscode.QuickInput;
    private steps: InputStep[] = [];

    private async stepThrough(start: InputStep): Promise<void> {
        let step: InputStep | void = start;

        while (step) {
            this.steps.push(step);

            if (this.current) {
                this.current.enabled = false;
                this.current.busy = true;
            }

            try {
                // eslint-disable-next-line no-await-in-loop
                step = await step(this);
            } catch (err) {
                if (err === InputFlowAction.BACK) {
                    this.steps.pop();
                    step = this.steps.pop();
                } else if (err === InputFlowAction.RESUME) {
                    step = this.steps.pop();
                } else if (err === InputFlowAction.CANCEL) {
                    step = undefined;
                } else {
                    throw err;
                }
            }
        }

        if (this.current) {
            this.current.dispose();
        }
    }

    async showQuickPick<T extends vscode.QuickPickItem, P extends QuickPickParameters<T>>({
        title,
        step,
        totalSteps,
        items,
        activeItem,
        canSelectMany,
        placeholder,
        buttons,
        shouldResume,
    }: P): Promise<T | (P extends { buttons: (infer I)[] } ? I : never)> {
        const disposables: vscode.Disposable[] = [];

        try {
            return await new Promise<T | (P extends { buttons: (infer I)[] } ? I : never)>(
                (
                    resolve: (Value: T | (P extends { buttons: (infer I)[] } ? I : never)) => void,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    reject: (reason?: any) => void,
                ) => {
                    const input: vscode.QuickPick<T> = vscode.window.createQuickPick<T>();
                    input.title = title;
                    input.step = step;
                    input.totalSteps = totalSteps;
                    input.canSelectMany = Boolean(canSelectMany);
                    input.placeholder = placeholder;
                    input.items = items;

                    if (activeItem) {
                        input.activeItems = [activeItem];
                    }

                    input.buttons = [
                        ...(this.steps.length > 1 ? [vscode.QuickInputButtons.Back] : []),
                        ...(buttons || []),
                    ];

                    disposables.push(
                        input.onDidTriggerButton((item: vscode.QuickInputButton) => {
                            if (item === vscode.QuickInputButtons.Back) {
                                reject(InputFlowAction.BACK);
                            } else {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                resolve(<any>item);
                            }
                        }),
                        input.onDidChangeSelection((items: readonly T[]) => resolve(items[0])),
                        input.onDidHide(() => {
                            (async (): Promise<void> => {
                                reject(
                                    shouldResume && (await shouldResume())
                                        ? InputFlowAction.RESUME
                                        : InputFlowAction.CANCEL,
                                );
                            })().catch(reject);
                        }),
                    );

                    if (this.current) {
                        this.current.dispose();
                    }

                    this.current = input;
                    this.current.show();
                },
            );
        } finally {
            disposables.forEach((d: vscode.Disposable) => d.dispose());
        }
    }

    async showInputBox<P extends InputBoxParameters>({
        title,
        step,
        totalSteps,
        value,
        prompt,
        ignoreFocusOut,
        validate,
        buttons,
        password,
        shouldResume,
    }: P): Promise<string | (P extends { buttons: (infer I)[] } ? I : never)> {
        const disposables: vscode.Disposable[] = [];

        try {
            return await new Promise<string | (P extends { buttons: (infer I)[] } ? I : never)>(
                (
                    resolve: (Value: string | (P extends { buttons: (infer I)[] } ? I : never)) => void,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    reject: (reason?: any) => void,
                ) => {
                    const input: vscode.InputBox = vscode.window.createInputBox();
                    input.title = title;
                    input.step = step;
                    input.totalSteps = totalSteps;
                    input.value = value || "";
                    input.prompt = prompt;
                    input.ignoreFocusOut = Boolean(ignoreFocusOut);
                    input.password = Boolean(password);

                    input.buttons = [
                        ...(this.steps.length > 1 ? [vscode.QuickInputButtons.Back] : []),
                        ...(buttons || []),
                    ];

                    let validating: Promise<string | undefined> = validate("");

                    disposables.push(
                        input.onDidTriggerButton((item: vscode.QuickInputButton) => {
                            if (item === vscode.QuickInputButtons.Back) {
                                reject(InputFlowAction.BACK);
                            } else {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                resolve(<any>item);
                            }
                        }),
                        input.onDidAccept(async () => {
                            const value: string = input.value;
                            input.enabled = false;
                            input.busy = true;

                            if (!(await validate(value))) {
                                resolve(value);
                            }

                            // eslint-disable-next-line require-atomic-updates
                            input.enabled = true;
                            // eslint-disable-next-line require-atomic-updates
                            input.busy = false;
                        }),
                        input.onDidChangeValue(async (text: string) => {
                            const current: Promise<string | undefined> = validate(text);
                            validating = current;
                            const validationMessage: string | undefined = await current;

                            if (current === validating) {
                                input.validationMessage = validationMessage;
                            }
                        }),
                        input.onDidHide(() => {
                            (async (): Promise<void> => {
                                reject(
                                    shouldResume && (await shouldResume())
                                        ? InputFlowAction.RESUME
                                        : InputFlowAction.CANCEL,
                                );
                            })().catch(reject);
                        }),
                    );

                    if (this.current) {
                        this.current.dispose();
                    }

                    this.current = input;
                    this.current.show();
                },
            );
        } finally {
            disposables.forEach((d: vscode.Disposable) => d.dispose());
        }
    }
}

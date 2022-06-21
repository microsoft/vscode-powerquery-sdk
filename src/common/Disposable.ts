/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

export interface IDisposable {
    readonly dispose: () => void;
}

export class Disposable implements IDisposable {
    constructor(private readonly onDispose: { (): void }) {
        if (!onDispose) {
            throw new Error("onDispose cannot be null or empty.");
        } else {
            this.onDispose = onDispose;
        }
    }

    public dispose = (): void => {
        this.onDispose();
    };
}

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

export interface IDisposable {
    dispose: () => void;
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

export default Disposable;

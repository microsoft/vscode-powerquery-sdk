/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { Disposable, IDisposable } from "../common/Disposable";
import { EventEmitter } from "events";

export type ExtractEventTypes<EvtObjOrEvtProp> = EvtObjOrEvtProp extends Record<string | number | symbol, infer Value>
    ? ExtractEventTypes<Value>
    : EvtObjOrEvtProp;

export class DisposableEventEmitter<Event extends string | symbol> extends EventEmitter implements IDisposable {
    protected readonly internalDisposables: IDisposable[] = [];

    constructor(options?: {
        /**
         * Enables automatic capturing of promise rejection.
         */
        captureRejections?: boolean | undefined;
    }) {
        super(options);
    }

    subscribeOneEvent(
        eventName: Event,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        listener: (...args: any[]) => void,
    ): IDisposable {
        this.on(eventName, listener);

        return new Disposable(() => {
            this.off(eventName, listener);
        });
    }

    dispose(): void {
        while (this.internalDisposables.length) {
            const disposable: IDisposable | undefined = this.internalDisposables.pop();

            if (disposable) {
                disposable.dispose();
            }
        }

        for (const evtName of this.eventNames()) {
            this.removeAllListeners(evtName);
        }
    }
}

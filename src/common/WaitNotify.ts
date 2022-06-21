/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as crypto from "crypto";
import { EventEmitter } from "events";

type ResolveHandler<T> = (value: T | PromiseLike<T>) => void;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RejectHandler = (reason: any) => void;

export class WaitNotify {
    private readonly eventEmitter: EventEmitter = new EventEmitter();
    private readonly waitingIds: Array<string> = [];

    wait(timeout: number = 0): Promise<void> {
        return new Promise<void>((resolve: ResolveHandler<void>, reject: RejectHandler) => {
            const currentId: string = crypto.randomUUID();
            this.waitingIds.push(currentId);
            let timeoutHandler: NodeJS.Timeout | undefined = undefined;

            this.eventEmitter.once(currentId, () => {
                if (timeoutHandler) {
                    clearTimeout(timeoutHandler);
                }

                resolve();
            });

            if (timeout) {
                timeoutHandler = setTimeout(() => {
                    const stillWaitingIdIndex: number = this.waitingIds.indexOf(currentId);

                    if (stillWaitingIdIndex !== -1) {
                        this.waitingIds.splice(stillWaitingIdIndex, 1);
                        reject(new Error("WaitNotify timeout"));
                    }
                }, timeout);
            }
        });
    }

    notify(): void {
        this.notifyAll();
    }

    notifyAll(): void {
        for (const waitingId of this.waitingIds) {
            this.eventEmitter.emit(waitingId);
        }

        this.waitingIds.length = 0;
    }

    notifyOne(): void {
        const maybeWaitingId: string | undefined = this.waitingIds.shift();

        if (maybeWaitingId) {
            this.eventEmitter.emit(maybeWaitingId);
        }
    }
}

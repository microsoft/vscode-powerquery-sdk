/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

/* eslint-disable prefer-rest-params */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { AnyFunction } from "./types";
import { cancelable } from "./cancelable";
import { CancellationToken } from "./CancellationToken";
import { noop } from "./noop";
import { once } from "./once";
import WebSocket from "ws";

export type AnyEventListener = (type: string, callback: AnyFunction) => void;

export type ExpectedEmitter =
    | {
          addEventListener?: AnyEventListener;
          removeEventListener?: AnyEventListener;
          addListener?: AnyEventListener;
          removeListener?: AnyEventListener;
          on?: AnyEventListener;
          off?: AnyEventListener;
      }
    | WebSocket;

export function makeEventAdder(
    cancellationToken: CancellationToken,
    emitter: ExpectedEmitter,
    allParametersInArray: boolean = false,
): AnyEventListener {
    const add: AnyFunction | undefined = emitter.addEventListener || emitter.addListener || emitter.on;

    if (add === undefined) {
        throw new Error("cannot register event listener");
    }

    const remove: AnyFunction | undefined = emitter.removeEventListener || emitter.removeListener || emitter.off;

    const eventsAndListeners: (AnyEventListener | string)[] = [];

    let clean: AnyFunction = noop;

    if (remove) {
        clean = once(() => {
            for (let i: number = 0, n: number = eventsAndListeners.length; i < n; i += 2) {
                remove.call(emitter, eventsAndListeners[i], eventsAndListeners[i + 1]);
            }
        });

        void cancellationToken.promise.then(clean);
    }

    return allParametersInArray
        ? (eventName: string, cb: AnyFunction): void => {
              function listener(): void {
                  clean();
                  const args: unknown[] = Array.prototype.slice.call(arguments);
                  (args as any).name = eventName;
                  cb(args);
              }

              eventsAndListeners.push(eventName, listener);
              add.call(emitter, eventName, listener);
          }
        : (event: string, cb: AnyFunction): void => {
              const listener: AnyEventListener = (arg: unknown) => {
                  clean();
                  cb(arg);
              };

              eventsAndListeners.push(event, listener);
              add.call(emitter, event, listener);
          };
}

export interface FromEventOption {
    ignoreErrors?: boolean;
    errorEventName?: string;
    allParametersInArray?: boolean;
}

export const fromEvent: (emitter: ExpectedEmitter, event: string, opt?: FromEventOption) => Promise<any> = cancelable(
    (cancellationToken: CancellationToken, emitter: ExpectedEmitter, event: string, opt: FromEventOption = {}) =>
        new Promise((resolve: AnyFunction, reject: AnyFunction) => {
            const add: AnyEventListener = makeEventAdder(cancellationToken, emitter, opt.allParametersInArray);
            add(event, resolve);

            if (!opt.ignoreErrors) {
                const { errorEventName = "error" }: FromEventOption = opt;

                if (errorEventName !== event) {
                    add(errorEventName, reject);
                }
            }
        }),
) as unknown as any;

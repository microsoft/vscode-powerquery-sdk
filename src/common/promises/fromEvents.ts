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

import { AnyEventListener, ExpectedEmitter, FromEventOption, makeEventAdder } from "./fromEvent";

export const fromEvents: (
    emitter: ExpectedEmitter,
    successEvents: string[],
    errorEvents?: string[],
    opt?: FromEventOption,
) => Promise<any> = cancelable(
    (
        cancellationToken: CancellationToken,
        emitter: ExpectedEmitter,
        successEvents: string[],
        errorEvents: string[] = ["error"],
        opt: FromEventOption = { allParametersInArray: true },
    ) => {
        if (typeof opt.allParametersInArray !== "boolean") {
            opt.allParametersInArray = true;
        }

        return new Promise((resolve: AnyFunction, reject: AnyFunction) => {
            const add: AnyEventListener = makeEventAdder(cancellationToken, emitter, opt.allParametersInArray);

            for (const oneSuccessEvtName of successEvents) {
                add(oneSuccessEvtName, resolve);
            }

            if (!opt.ignoreErrors) {
                for (const oneErrorEvtName of errorEvents) {
                    add(oneErrorEvtName, reject);
                }
            }
        });
    },
) as unknown as any;

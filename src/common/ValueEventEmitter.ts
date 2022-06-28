/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { IDisposable } from "common/Disposable";

export type ExtractValueEventEmitterTypes<EvtObjOrEvtProp> = EvtObjOrEvtProp extends Record<infer Key, infer Value>
    ? Value extends ValueEventEmitter
        ? Key
        : ExtractValueEventEmitterTypes<Value>
    : unknown;

type ValueUpdateListener<T> = (value: T) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class ValueEventEmitter<T = any> implements IDisposable {
    private _listeners: ValueUpdateListener<T>[] = [];

    constructor(public value: T) {}

    subscribe(listener: ValueUpdateListener<T>): void {
        this._listeners.push(listener);
    }

    unsubscribe(listener: ValueUpdateListener<T>): void {
        this._listeners = this._listeners.filter((l: ValueUpdateListener<T>) => l !== listener);
    }

    emit(value?: T): void {
        this.value = value ?? this.value;
        this._listeners.forEach((l: ValueUpdateListener<T>) => l(this.value));
    }

    dispose(): void {
        this._listeners = [];
    }
}

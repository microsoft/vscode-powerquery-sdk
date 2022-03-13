import { IDisposable } from "common/Disposable";
type ValueUpdateListener<T> = (value: T) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class ValueEventEmitter<T = any> implements IDisposable {
    private _listeners: ValueUpdateListener<T>[] = [];

    constructor(public value: T) {}

    subscribe(listener: ValueUpdateListener<T>) {
        this._listeners.push(listener);
    }

    unsubscribe(listener: ValueUpdateListener<T>) {
        this._listeners = this._listeners.filter(l => l !== listener);
    }

    emit(value?: T) {
        this.value = value || this.value;
        this._listeners.forEach(l => l(this.value));
    }

    dispose(): void {
        this._listeners = [];
    }
}

export default ValueEventEmitter;

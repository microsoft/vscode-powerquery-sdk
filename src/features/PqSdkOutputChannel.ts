import * as vscode from "vscode";
import { OutputChannel, ViewColumn } from "vscode";
import { IDisposable } from "common/Disposable";
import { ExtensionConstants } from "constants/power-query-sdk-extension";

// we can do write to file or log according to a log_level over here
export class PqSdkOutputChannel implements OutputChannel, IDisposable {
    _channel: vscode.OutputChannel;

    readonly name: string = ExtensionConstants.OutputChannelName;

    constructor() {
        this._channel = vscode.window.createOutputChannel(ExtensionConstants.OutputChannelName);
    }

    dispose(): void {
        this._channel.dispose();
    }

    append(value: string): void {
        this._channel.append(value);
    }

    appendLine(value: string): void {
        this._channel.appendLine(value);
    }

    public appendLineWithTimeStamp(line: string) {
        const now: Date = new Date();
        this.appendLine(`[${now.toLocaleTimeString()}]\t${line}`);
    }

    public appendDebugLine(value: string): void {
        this.appendLineWithTimeStamp(`[Debug]\t${value}`);
    }

    public appendTraceLine(value: string): void {
        this.appendLineWithTimeStamp(`[Trace]\t${value}`);
    }

    public appendInfoLine(value: string): void {
        this.appendLineWithTimeStamp(`[Info]\t${value}`);
    }

    public appendErrorLine(value: string): void {
        this.appendLineWithTimeStamp(`[Error]\t${value}`);
    }

    clear(): void {
        this._channel.clear();
    }

    hide(): void {
        this._channel.hide();
    }

    show(preserveFocus?: boolean): void;
    show(column?: ViewColumn, preserveFocus?: boolean): void;
    show(...args: unknown[]): void {
        this._channel.show(...(args as Parameters<OutputChannel["show"]>));
    }
}

export default PqSdkOutputChannel;

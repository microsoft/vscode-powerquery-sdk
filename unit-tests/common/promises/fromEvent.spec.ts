/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as chai from "chai";

import { EventEmitter } from "events";

import { fromEvent } from "../../../src/common/promises/fromEvent";
import { noop } from "../../../src/common/promises/noop";

const expect = chai.expect;

const emitter: EventEmitter = new EventEmitter();

describe("Promises::fromEvent", () => {
    it("Nodejs EventEmitter", () => {
        const promise = fromEvent(emitter, "yoo");
        emitter.emit("yoo");

        return promise;
    });

    it("Nodejs EventEmitter: arg1, arg2", () => {
        const promise = fromEvent(emitter, "yoo");
        emitter.emit("yoo", "arg1", "arg2");

        return promise.then(value => {
            expect(value).eq("arg1");
        });
    });

    it("Nodejs EventEmitter: [arg1, arg2]", () => {
        const promise = fromEvent(emitter, "yoo", { allParametersInArray: true });
        emitter.emit("yoo", "arg1", "arg2");

        return promise.then(value => {
            expect(value.name).eq("yoo");
            expect(value).eql(["arg1", "arg2"]);
        });
    });

    it("Nodejs EventEmitter: normal error event", () => {
        const promise = fromEvent(emitter, "error");
        emitter.emit("error");

        return promise;
    });

    it("Nodejs EventEmitter: rejected error event", () => {
        const promise = fromEvent(emitter, "nonError");
        emitter.emit("error");

        return promise.then(
            _value => {
                expect(false).true;
            },
            _error => {
                expect(true).true;
            },
        );
    });

    it("Nodejs EventEmitter: customized rejected error event", () => {
        const dummyError = new Error();

        const promise = fromEvent(emitter, "nonError", {
            errorEventName: "customized-error",
        });

        emitter.emit("customized-error", dummyError);

        return promise.then(
            _value => {
                expect(false).true;
            },
            error => {
                expect(error).eq(dummyError);
            },
        );
    });

    it("Nodejs EventEmitter: ignored rejected error event", () => {
        const dummyError = new Error();

        emitter.once("error", noop);

        const promise = fromEvent(emitter, "nonError", {
            ignoreErrors: true,
        });

        emitter.emit("error", dummyError);
        emitter.emit("nonError", "arg1");

        return promise.then(
            value => {
                expect(value).eq("arg1");
            },
            _error => {
                expect(false).true;
            },
        );
    });

    it("Nodejs EventEmitter: listeners got removed once emitted", () => {
        const promise = fromEvent(emitter, "yoo");
        emitter.emit("yoo");

        return promise.then(_ => {
            expect(emitter.listeners("yoo")).eql([]);
            expect(emitter.listeners("error")).eql([]);
        });
    });

    it("Nodejs EventEmitter: listeners got removed once rejected", () => {
        const promise = fromEvent(emitter, "yoo");
        emitter.emit("error");

        return promise.catch(_ => {
            expect(emitter.listeners("yoo")).eql([]);
            expect(emitter.listeners("error")).eql([]);
        });
    });
});

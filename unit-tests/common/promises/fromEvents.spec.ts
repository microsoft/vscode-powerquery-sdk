/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as chai from "chai";

import { EventEmitter } from "events";

import { fromEvents } from "../../../src/common/promises/fromEvents";

const expect = chai.expect;

const emitter: EventEmitter = new EventEmitter();

describe("Promises::fromEvents", () => {
    it("Nodejs EventEmitter: success event", () => {
        const promise = fromEvents(emitter, ["yoo", "ha"]);
        emitter.emit("yoo", "arg1", "arg2");

        return promise.then(value => {
            expect(value.name).eq("yoo");
            expect(value).eql(["arg1", "arg2"]);
        });
    });

    it("Nodejs EventEmitter: error event", () => {
        const promise = fromEvents(emitter, ["yoo", "ha"], ["oops"]);
        emitter.emit("oops", "errArg1", "errArg2");

        return promise.catch(value => {
            expect(value.name).eq("oops");
            expect(value).eql(["errArg1", "errArg2"]);
        });
    });
});

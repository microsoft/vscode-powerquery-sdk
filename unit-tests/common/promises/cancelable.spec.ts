/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as chai from "chai";
import * as sinon from "sinon";

import { cancelable } from "../../../src/common/promises/cancelable";
import { CancellationToken } from "../../../src/common/promises/CancellationToken";
import { noop } from "../../../src/common/promises/noop";

const expect = chai.expect;

describe("Promises::cancelable", () => {
    it("do not replace the existing cancel token", () => {
        const token = new CancellationToken(noop);
        const spy = sinon.spy();
        cancelable(spy)(token, "yoo", "ha");
        expect(spy.calledOnceWith(token, "yoo", "ha")).true;
    });

    it("inject an existing cancel token", () => {
        const token = new CancellationToken(noop);
        const callerStub = sinon.stub().returns(Promise.resolve());
        const spy = sinon.spy(callerStub);
        cancelable(spy)(token, "yoo", "ha");
        expect(spy.calledOnce).true;
        const spiedFirstCall = spy.getCall(0);
        expect(CancellationToken.isCancellationToken(spiedFirstCall.firstArg)).true;
    });
});

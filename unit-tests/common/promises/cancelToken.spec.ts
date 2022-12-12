/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as chai from "chai";

import { Cancel, CancelSource, CancelToken } from "../../../src/common/promises/CancelToken";
import { noop } from "../../../src/common/promises/noop";

const expect = chai.expect;

describe("Promises::CancelTokenModule", () => {
    describe("Cancel Class", () => {
        it("property: message", () => {
            const cancel = new Cancel("yoo");
            expect(cancel.message).eq("yoo");
        });

        it("method: captureStackTrace", () => {
            const cancel = new Cancel("ha");
            expect(cancel.captureStackTrace()?.length).gt(0);
        });
    });

    describe("CancelToken Class", () => {
        it("return the same token if any", () => {
            expect(CancelToken.from(CancelToken.none)).eq(CancelToken.none);
        });

        it("return the abortController", () => {
            const controller = new AbortController();
            const token = CancelToken.from(controller.signal);

            expect(token).instanceof(CancelToken);
            expect(token.requested).false;

            controller.abort();

            expect(token.requested).true;
        });

        it("method: isCancelToken", () => {
            expect(CancelToken.isCancelToken(undefined as never)).false;
            expect(CancelToken.isCancelToken(null as never)).false;
            expect(CancelToken.isCancelToken({})).false;
            expect(CancelToken.isCancelToken(new CancelToken(noop))).true;
        });

        it("property: promising", async () => {
            const { token, cancel }: CancelSource = new CancelSource();
            const { promise }: CancelToken = token;
            expect(token.requested).false;
            cancel("testing promise");
            const cancelError: Cancel = await promise;
            expect(token.requested).true;
            expect(cancelError.message).eq("testing promise");
        });

        it("property: reason", () => {
            const { token, cancel }: CancelSource = new CancelSource();

            expect(token.requested).false;
            expect(token.reason).undefined;
            cancel("testing reason");
            expect(token.requested).true;
            expect(token.reason?.message).eq("testing reason");
        });

        it("property: requested", () => {
            const { token, cancel }: CancelSource = new CancelSource();

            expect(token.requested).false;
            cancel("testing requested");
            expect(token.requested).true;
        });

        it("method: throwIfRequested", () => {
            const { token, cancel }: CancelSource = new CancelSource();

            token.throwIfRequested();
            cancel("testing throwIfRequested");

            try {
                token.throwIfRequested();
                expect(false).true;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (reason: any) {
                expect(reason).instanceof(Cancel);
                expect(reason.message).eq("testing throwIfRequested");
            }
        });
    });

    describe("CancelSource Class", () => {
        it("simple usage", () => {
            const { token, cancel }: CancelSource = new CancelSource();
            expect(token.requested).false;
            cancel("Simple reason");
            expect(token.requested).true;
        });

        it("of dependents, papa canceling", () => {
            const { token, cancel }: CancelSource = new CancelSource();
            const { token: forked }: CancelSource = new CancelSource([token]);
            expect(forked.requested).false;
            cancel("Papa reason");
            expect(forked.requested).true;
            expect(forked.reason?.message).eq("Papa reason");
        });

        it("of dependents, child canceling", () => {
            const { token }: CancelSource = new CancelSource();
            const { token: forked, cancel }: CancelSource = new CancelSource([token]);
            expect(token.requested).false;
            expect(forked.requested).false;
            cancel("Child reason");
            expect(token.requested).false;
            expect(forked.requested).true;
            expect(forked.reason?.message).eq("Child reason");
        });
    });
});

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as chai from "chai";

import { Cancel, CancellationToken, CancellationTokenSource } from "../../../src/common/promises/CancellationToken";
import { noop } from "../../../src/common/promises/noop";

const expect = chai.expect;

describe("Promises::CancellationTokenModule", () => {
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

    describe("CancellationToken Class", () => {
        it("return the same token if any", () => {
            expect(CancellationToken.from(CancellationToken.none)).eq(CancellationToken.none);
        });

        it("return the abortController", () => {
            const controller = new AbortController();
            const token = CancellationToken.fromAbortSignal(controller.signal);

            expect(token).instanceof(CancellationToken);
            expect(token.requested).false;

            controller.abort();

            expect(token.requested).true;
        });

        it("method: isCancelToken", () => {
            expect(CancellationToken.isCancellationToken(undefined as never)).false;
            expect(CancellationToken.isCancellationToken(null as never)).false;
            expect(CancellationToken.isCancellationToken({})).false;
            expect(CancellationToken.isCancellationToken(new CancellationToken(noop))).true;
        });

        it("property: promising", async () => {
            const { token, cancel }: CancellationTokenSource = new CancellationTokenSource();
            const { promise }: CancellationToken = token;
            expect(token.requested).false;
            cancel("testing promise");
            const cancelError: Cancel = await promise;
            expect(token.requested).true;
            expect(cancelError.message).eq("testing promise");
        });

        it("property: reason", () => {
            const { token, cancel }: CancellationTokenSource = new CancellationTokenSource();

            expect(token.requested).false;
            expect(token.reason).undefined;
            cancel("testing reason");
            expect(token.requested).true;
            expect(token.reason?.message).eq("testing reason");
        });

        it("property: requested", () => {
            const { token, cancel }: CancellationTokenSource = new CancellationTokenSource();

            expect(token.requested).false;
            cancel("testing requested");
            expect(token.requested).true;
        });

        it("method: throwIfRequested", () => {
            const { token, cancel }: CancellationTokenSource = new CancellationTokenSource();

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

    describe("CancellationTokenSource Class", () => {
        it("simple usage", () => {
            const { token, cancel }: CancellationTokenSource = new CancellationTokenSource();
            expect(token.requested).false;
            cancel("Simple reason");
            expect(token.requested).true;
        });

        it("of dependents, papa canceling", () => {
            const { token, cancel }: CancellationTokenSource = new CancellationTokenSource();
            const { token: forked }: CancellationTokenSource = new CancellationTokenSource([token]);
            expect(forked.requested).false;
            cancel("Papa reason");
            expect(forked.requested).true;
            expect(forked.reason?.message).eq("Papa reason");
        });

        it("of dependents, child canceling", () => {
            const { token }: CancellationTokenSource = new CancellationTokenSource();
            const { token: forked, cancel }: CancellationTokenSource = new CancellationTokenSource([token]);
            expect(token.requested).false;
            expect(forked.requested).false;
            cancel("Child reason");
            expect(token.requested).false;
            expect(forked.requested).true;
            expect(forked.reason?.message).eq("Child reason");
        });
    });
});

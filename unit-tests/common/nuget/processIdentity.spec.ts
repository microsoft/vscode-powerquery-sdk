/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import { expect } from "chai";
import cp = require("child_process");
import * as sinon from "sinon";

import { getProcessCreationTime } from "../../../src/utils/processIdentity";

describe("Windows process identity", () => {
    const pid = 2147483646;
    let query: sinon.SinonStub;

    beforeEach(() => {
        query = sinon.stub(cp, "execFile").yields(null, "638967123456789012", "");
    });

    afterEach(() => sinon.restore());

    it("reads invariant OS creation ticks without truncating their precision", async () => {
        expect(await getProcessCreationTime(pid)).to.equal("638967123456789012");
        expect(query.firstCall.args[1]).to.include("-NoProfile");
        expect(query.firstCall.args[1]).to.include("-NonInteractive");
        expect(query.firstCall.args[1].at(-1)).to.contain(`GetProcessById(${pid})`);
        expect(query.firstCall.args[2]).to.include({ windowsHide: true, timeout: 10000 });
    });

    it("does not cache another PID's identity across reuse", async () => {
        expect(await getProcessCreationTime(pid)).to.equal("638967123456789012");
        query.yields(null, "638967123456789999", "");

        expect(await getProcessCreationTime(pid)).to.equal("638967123456789999");
        expect(query.calledTwice).to.be.true;
    });

    it("reports only a confirmed missing process as absent", async () => {
        query.yields(Object.assign(new Error("process missing"), { code: 3 }), "", "");

        expect(await getProcessCreationTime(pid)).to.be.undefined;
    });

    it("does not treat a killed query as proof that the owner has exited", async () => {
        query.yields(Object.assign(new Error("query killed"), { code: 3, killed: true }), "", "");

        expect(await failure(getProcessCreationTime(pid))).to.have.property("message", "query killed");
    });

    async function failure(query: Promise<unknown>): Promise<unknown> {
        return query.then(
            () => {
                throw new Error("Identity lookup unexpectedly succeeded");
            },
            error => error,
        );
    }

    it("fails closed when process creation time is inaccessible", async () => {
        query.yields(new Error("access denied"), "", "access denied");

        expect(await failure(getProcessCreationTime(pid))).to.have.property("message", "access denied");
    });

    it("fails closed when the identity query cannot run", async () => {
        query.yields(new Error("query timed out"), "", "");

        expect(await failure(getProcessCreationTime(pid))).to.have.property("message", "query timed out");
    });

    it("rejects malformed identity output", async () => {
        query.yields(null, "unknown", "");

        expect(await failure(getProcessCreationTime(pid)))
            .to.have.property("message")
            .that.contains("Cannot verify Windows process identity");
    });

    it("rejects invalid process IDs before starting a query", async () => {
        await Promise.all(
            [-1, 0, 1.5, NaN, Infinity, 2147483648].map(async invalidPid => {
                expect(await failure(getProcessCreationTime(invalidPid)))
                    .to.have.property("message")
                    .that.contains("Invalid Windows process ID");
            }),
        );

        expect(query.called).to.be.false;
    });

    it("keeps the event loop responsive while identity verification is pending", async () => {
        let finish: () => void = () => {
            throw new Error("Query did not start");
        };
        query.callsFake((_file, _args, _options, callback) => {
            finish = () => callback(null, "638967123456789012", "");
            return new cp.ChildProcess();
        });
        const pending = getProcessCreationTime(pid);
        await new Promise<void>(resolve => setImmediate(resolve));
        finish();

        expect(await pending).to.equal("638967123456789012");
    });
});

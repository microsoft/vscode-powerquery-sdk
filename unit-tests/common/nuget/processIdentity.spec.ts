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
        query = sinon.stub(cp, "spawnSync").returns({
            pid: 1,
            output: [null, "638967123456789012", ""],
            stdout: "638967123456789012",
            stderr: "",
            status: 0,
            signal: null,
        });
    });

    afterEach(() => sinon.restore());

    it("reads invariant OS creation ticks without truncating their precision", () => {
        expect(getProcessCreationTime(pid)).to.equal("638967123456789012");
        expect(query.firstCall.args[1]).to.include("-NoProfile");
        expect(query.firstCall.args[1]).to.include("-NonInteractive");
        expect(query.firstCall.args[1].at(-1)).to.contain(`GetProcessById(${pid})`);
        expect(query.firstCall.args[2]).to.include({ windowsHide: true, timeout: 10000 });
    });

    it("does not cache another PID's identity across reuse", () => {
        expect(getProcessCreationTime(pid)).to.equal("638967123456789012");
        query.returns({ status: 0, stdout: "638967123456789999", stderr: "" });

        expect(getProcessCreationTime(pid)).to.equal("638967123456789999");
        expect(query.calledTwice).to.be.true;
    });

    it("reports only a confirmed missing process as absent", () => {
        query.returns({ status: 3, stdout: "", stderr: "" });

        expect(getProcessCreationTime(pid)).to.be.undefined;
    });

    it("fails closed when process creation time is inaccessible", () => {
        query.returns({ status: 1, stdout: "", stderr: "access denied" });

        expect(() => getProcessCreationTime(pid)).to.throw("access denied");
    });

    it("fails closed when the identity query cannot run", () => {
        query.returns({ status: null, error: new Error("query timed out") });

        expect(() => getProcessCreationTime(pid)).to.throw("query timed out");
    });

    it("rejects malformed identity output", () => {
        query.returns({ status: 0, stdout: "unknown", stderr: "" });

        expect(() => getProcessCreationTime(pid)).to.throw("Cannot verify Windows process identity");
    });

    it("rejects invalid process IDs before starting a query", () => {
        for (const invalidPid of [-1, 0, 1.5, NaN, Infinity, 2147483648]) {
            expect(() => getProcessCreationTime(invalidPid)).to.throw("Invalid Windows process ID");
        }

        expect(query.called).to.be.false;
    });
});

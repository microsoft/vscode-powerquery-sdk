/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import * as chai from "chai";

import { Server as WebSocketServer, AddressInfo as WebSocketServerAddressInfo } from "ws";
import { JsonRpcError } from "json-rpc-protocol";

import { ConnectionError, JsonRpcWebSocketClient } from "../../../src/common/websockets/JsonRpcWebSocketClient";
import { AbortedConnection } from "../../../src/common/websockets/WebSocketClient";
import { fromEvent } from "../../../src/common/promises/fromEvent";
import { JsonRpcHelper } from "../../../src/common/websockets/JsonRpcHelper";
import { noop } from "../../../src/common/promises/noop";

const expect = chai.expect;

describe("websockets::JsonRpcWebSocketClient", () => {
    let server: WebSocketServer;
    let serverPort: number;

    before(
        (): Promise<void> =>
            new Promise(resolve => {
                server = new WebSocketServer(
                    {
                        host: "localhost",
                        port: 0,
                    },
                    function () {
                        serverPort = (server.address() as WebSocketServerAddressInfo).port;

                        void resolve();
                    },
                ).on("connection", socket => {
                    const jsonRpcHelper = new JsonRpcHelper(message => {
                        if (message.type === "notification") {
                            return;
                        }

                        if (message.method === "echoMethod") {
                            return message.params[0];
                        }

                        if (message.method === "error") {
                            throw new JsonRpcError(message.params[0]);
                        }
                    });

                    jsonRpcHelper.on("data", data => {
                        if (socket.readyState === socket.OPEN) {
                            socket.send(data);
                        }
                    });

                    socket.on("message", message => {
                        jsonRpcHelper.write(message);
                    });
                });
            }),
    );

    after(() => {
        server.close();
    });

    let client: JsonRpcWebSocketClient;

    beforeEach(() => {
        client = new JsonRpcWebSocketClient(`ws://localhost:${serverPort}`);
    });

    afterEach(() => {
        client.close().catch(noop);
    });

    it("emit open event", () => {
        void client.open();

        return fromEvent(client, "open");
    });

    it("emit close event", async () => {
        await client.open();
        void client.close();

        return fromEvent(client, "closed");
    });

    describe("method open", () => {
        it("cannot open twice in parallel", async () => {
            client.open().catch(noop);

            try {
                await client.open();
            } catch (error) {
                expect(error).instanceof(ConnectionError);
            }
        });

        it("cannot open twice in sequence", async () => {
            await client.open();

            try {
                await client.open();
            } catch (error) {
                expect(error).instanceof(ConnectionError);
            }
        });

        it("open successfully", () => client.open());

        it("cannot non-exising port", async () => {
            let errorMessage: string = "";

            try {
                client = new JsonRpcWebSocketClient("ws://localhost:81");
                await client.open();
            } catch (error: any) {
                errorMessage = error.message;
            }

            expect(errorMessage.length).gt(0);
        });
    });

    describe("method close", () => {
        it("close successfully v1", async () => {
            await client.open();

            return client.close();
        });

        it("close successfully v2", () => client.close());

        it("could be aborted", async () => {
            const openingDeferred = client.open();
            await client.close();
            let thrown = false;

            try {
                await openingDeferred;
            } catch (e) {
                expect(e).instanceof(AbortedConnection);
                thrown = true;
            }

            expect(thrown).true;
        });

        it("reject any pending once closed", async () => {
            await client.open();
            const callDeferred = client.call("yoo");
            await client.close();
            let thrown = false;

            try {
                await callDeferred;
            } catch (e) {
                expect(e).instanceof(ConnectionError);
                thrown = true;
            }

            expect(thrown).true;
        });
    });

    describe("method call", () => {
        it("reject if not opened yet", async () => {
            let thrown = false;

            try {
                await client.call("yoo");
            } catch (e) {
                expect(e).instanceof(ConnectionError);
                thrown = true;
            }

            expect(thrown).true;
        });

        it("invoke RPC echoMethod method successfully", async () => {
            await client.open();
            const result = await client.call("echoMethod", [77]);
            expect(result).eq(77);
        });

        it("invoke RPC error method successfully", async () => {
            await client.open();
            let thrown = false;

            try {
                await client.call("error", ["dummy error"]);
            } catch (e: any) {
                expect(e.message).eq("dummy error");

                thrown = true;
            }

            expect(thrown).true;
        });
    });

    describe("property status", () => {
        it("closed before opening", () => {
            expect(client.status).eq("closed");
        });

        it("connecting while opening", () => {
            void client.open();
            expect(client.status).eq("connecting");
        });

        it("open once opened", async () => {
            await client.open();
            expect(client.status).eq("open");
        });

        it("open once opened", async () => {
            await client.open();
            expect(client.status).eq("open");
        });

        it("closed once closed", async () => {
            await client.open();
            await client.close();
            expect(client.status).eq("closed");
        });
    });
});

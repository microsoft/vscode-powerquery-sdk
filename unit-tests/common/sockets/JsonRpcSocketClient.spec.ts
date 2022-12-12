/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import * as chai from "chai";
import * as net from "net";

import { Message, ResponseMessage, SocketMessageReader, SocketMessageWriter } from "vscode-jsonrpc/node";
import { SocketAbortedConnection, SocketConnectionError } from "../../../src/common/sockets/SocketClient";
import { fromEvent } from "../../../src/common/promises/fromEvent";
import { JsonRpcSocketClient } from "../../../src/common/sockets/JsonRpcSocketClient";
import { noop } from "../../../src/common/promises/noop";

const expect = chai.expect;

describe("sockets::JsonRpcSocketClient.spec", function () {
    let server: net.Server;
    let serverPort: number;

    before(
        (): Promise<void> =>
            new Promise(resolve => {
                server = new net.Server(
                    {
                        keepAlive: true,
                    },
                    (socket: net.Socket) => {
                        const reader: SocketMessageReader = new SocketMessageReader(socket, "utf-8");
                        const writer: SocketMessageWriter = new SocketMessageWriter(socket, "utf-8");

                        reader.listen((message: Message) => {
                            if (Message.isNotification(message)) {
                                return;
                            }

                            if (Message.isRequest(message)) {
                                if (message.method === "echoMethod") {
                                    void writer.write({
                                        id: message.id,
                                        result: (message.params as Array<unknown>)?.[0],
                                    } as ResponseMessage);
                                }

                                if (message.method === "error") {
                                    void writer.write({
                                        id: message.id,
                                        error: {
                                            message: (message.params as Array<unknown>)?.[0],
                                            code: 0x1,
                                            data: {},
                                        },
                                    } as ResponseMessage);
                                }
                            }
                        });
                    },
                );

                server.listen();
                serverPort = (server.address() as net.AddressInfo).port;
                void resolve();
            }),
    );

    after(() => {
        server.close();
    });

    let client: JsonRpcSocketClient;

    beforeEach(() => {
        client = new JsonRpcSocketClient(serverPort);
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
                expect(error).instanceof(SocketConnectionError);
            }
        });

        it("cannot open twice in sequence", async () => {
            await client.open();

            try {
                await client.open();
            } catch (error) {
                expect(error).instanceof(SocketConnectionError);
            }
        });

        it("open successfully", () => client.open());

        it("cannot non-exising port", async () => {
            let errorMessage: string = "";

            try {
                client = new JsonRpcSocketClient(81);
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
                expect(e).instanceof(SocketAbortedConnection);
                thrown = true;
            }

            expect(thrown).true;
        });

        it("reject any pending once closed", async () => {
            await client.open();
            const callDeferred = client.request("yoo");
            await client.close();
            let thrown = false;

            try {
                await callDeferred;
            } catch (e) {
                expect(e).instanceof(SocketConnectionError);
                thrown = true;
            }

            expect(thrown).true;
        });
    });

    describe("method call", () => {
        it("reject if not opened yet", async () => {
            let thrown = false;

            try {
                await client.request("yoo");
            } catch (e) {
                expect(e).instanceof(SocketConnectionError);
                thrown = true;
            }

            expect(thrown).true;
        });

        it("invoke RPC echoMethod method successfully", async () => {
            await client.open();
            const result = await client.request("echoMethod", [77]);
            expect(result).eq(77);
        });

        it("invoke RPC error method successfully", async () => {
            await client.open();
            let thrown = false;

            try {
                await client.request("error", ["dummy error"]);
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

import { EventEmitter } from "node:events";
import type { Server } from "node:http";
import http from "node:http";
import { describe, it } from "vitest";
import { assertIdentical } from "@kensio/smartass";
import { waitNodeServerListen } from "./wait-node-server-listen.js";

describe("waitNodeServerListen", () => {
  it("resolves immediately when server is already listening", async () => {
    const server = http.createServer();

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });

    try {
      await waitNodeServerListen(server);

      assertIdentical(server.listening, true);
    } finally {
      server.close();
    }
  });

  it("resolves when server emits listening", async () => {
    const server = new TestServer();
    const wait = waitNodeServerListen(server.asNodeServer());

    server.emit("listening");

    await wait;

    assertIdentical(server.listenerCount("listening"), 0);
    assertIdentical(server.listenerCount("error"), 0);
  });

  it("rejects when server emits error", async () => {
    const server = new TestServer();
    const cause = new Error("listen failed");
    const wait = waitNodeServerListen(server.asNodeServer());

    server.emit("error", cause);

    const error = await promiseError(wait);

    assertIdentical(error, cause);
    assertIdentical(server.listenerCount("listening"), 0);
    assertIdentical(server.listenerCount("error"), 0);
  });
});

// eslint-disable-next-line unicorn/prefer-event-target
class TestServer extends EventEmitter {
  readonly listening = false;

  asNodeServer(): Server {
    return this as unknown as Server;
  }
}

async function promiseError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }

  throw new Error("Expected promise to reject");
}

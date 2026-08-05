import http from "node:http";
import { describe, it } from "vitest";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertTrue,
} from "@kensio/smartass";
import { NodeServerPortBinder } from "./node-server-port-binder.js";
import { SimAwsLocalPortInUse } from "./sim-aws-local-port.error.js";
import {
  listenOnFreePort,
  serverPort,
} from "../../../../test/serve/held-port.js";
import { promiseError } from "../../../../test/promise-error.js";

describe("NodeServerPortBinder", () => {
  it("binds a free port", async () => {
    // Given a server that is not listening yet
    const server = http.createServer();
    const binder = new NodeServerPortBinder({ server });

    // When it binds an operating system chosen port
    await binder.bind(0);

    // Then it is listening
    assertTrue(server.listening);
    server.close();
  });

  it("waits for a held port to be released", async () => {
    // Given another listener still holding a port
    const holder = await listenOnFreePort();
    const port = serverPort(holder);
    const server = http.createServer();
    const binder = new NodeServerPortBinder({
      server,
      waitMs: 2000,
      waitIntervalMs: 10,
    });

    // When the holder lets go shortly after binding starts
    setTimeout(() => {
      holder.close();
    }, 50);
    await binder.bind(port);

    // Then the same port was bound rather than the bind failing
    assertIdentical(serverPort(server), port);
    server.close();
  });

  it("throws naming the port when it stays held", async () => {
    // Given another listener that keeps hold of a port
    const holder = await listenOnFreePort();
    const port = serverPort(holder);
    const binder = new NodeServerPortBinder({
      server: http.createServer(),
      waitMs: 40,
      waitIntervalMs: 10,
    });

    // When the wait for that port runs out
    const error = await promiseError(binder.bind(port));

    // Then it says which port is held and for how long it waited
    assertInstanceOf(error, SimAwsLocalPortInUse);
    assertStringIncludes(error.message, `Port ${String(port)} is held`);
    assertStringIncludes(error.message, "after waiting 40ms");
    holder.close();
  });

  it("throws a listen failure that is not a held port", async () => {
    // Given a binder asked for a port number that cannot exist
    const binder = new NodeServerPortBinder({ server: http.createServer() });

    // When it tries to bind that port
    const error = await promiseError(binder.bind(70_000));

    // Then the underlying failure is reported rather than waited out
    assertInstanceOf(error, RangeError);
    assertStringIncludes(error.message, "70000");
  });
});

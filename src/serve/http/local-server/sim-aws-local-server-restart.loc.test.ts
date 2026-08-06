import { describe, it } from "vitest";
import { assertIdentical } from "@kensio/smartass";
import { SimAwsLocalServer } from "./sim-aws-local-server.js";
import {
  listenOnFreePort,
  serverPort,
} from "../../../../test/serve/held-port.js";
import {
  assertConnectionEnds,
  keepAliveConnection,
  startAnotherRequest,
} from "../../../../test/serve/local-server-connection.js";

describe("Simulated AWS local HTTP server restart", () => {
  it("ends an idle keep-alive connection when closed", async () => {
    // Given a served simulated AWS with a client holding a keep-alive connection
    const server = await new SimAwsLocalServer().listen(0);
    const connection = await keepAliveConnection(Number(server.port));

    // When the server is closed
    await server.close();

    // Then the connection ends without the client having done anything
    await assertConnectionEnds(connection);
  });

  it("ends a connection part way through a request when closed", async () => {
    // Given a client that has started another request on its open connection
    const server = await new SimAwsLocalServer().listen(0);
    const connection = await keepAliveConnection(Number(server.port));
    await startAnotherRequest(connection);

    // When the server is closed
    await server.close();

    // Then that connection ends too, rather than being left to finish
    await assertConnectionEnds(connection);
  });

  it("waits for a pinned port that is still held", async () => {
    // Given a pinned port another listener has not let go of yet
    const holder = await listenOnFreePort();
    const pinnedPort = serverPort(holder);

    // When a server asks for that port and the holder lets go shortly after
    setTimeout(() => {
      holder.close();
    }, 50);
    const server = await new SimAwsLocalServer().listen(pinnedPort);

    // Then it took the port rather than failing on it being busy
    assertIdentical(server.port, String(pinnedPort));
    await server.close();
  });

  it("binds a pinned port again immediately after closing", async () => {
    // Given a served simulated AWS on a pinned port, with an open connection
    const first = await new SimAwsLocalServer().listen(0);
    const pinnedPort = Number(first.port);
    await keepAliveConnection(pinnedPort);

    // When it closes and a replacement asks for the same port
    await first.close();
    const second = await new SimAwsLocalServer().listen(pinnedPort);

    // Then the replacement serves on the port the first one had
    assertIdentical(second.port, String(pinnedPort));
    await second.close();
  });
});

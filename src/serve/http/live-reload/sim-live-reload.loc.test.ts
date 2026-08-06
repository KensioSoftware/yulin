import { GetObjectCommand } from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertStringEndsWith,
  assertStringIncludes,
  assertStringLength,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../service/aws/sim-aws.js";
import { serveSimAws } from "../local-server/sim-aws-local-server.js";
import { simLiveReloadHeaderName } from "./sim-live-reload.config.js";
import { SimLiveReloadChannel } from "../../../../test/serve/live-reload-channel.js";
import { SimLiveReloadSocket } from "../../../../test/serve/live-reload-socket.js";
import {
  simBrowserFetch,
  simServedSite,
  simServedSiteS3Client,
  simServedSiteUrl,
} from "../../../../test/serve/served-site.js";

const page = "<html><body><h1>Hello</h1></body></html>";

describe("Live reload over a local server", () => {
  it("leaves responses alone when it is off", async () => {
    // Given a served site with live reload not asked for
    const simAws = new SimAws();
    const server = await serveSimAws({ simAws });

    try {
      await simServedSite(simAws, "quiet-site", page);

      // When a browser asks for the page
      const response = await simBrowserFetch(
        simServedSiteUrl(simAws, server, "quiet-site"),
      );

      // Then it gets the page as it was stored, and no sign of live reload
      assertIdentical(await response.text(), page);
      assertIdentical(response.headers.get(simLiveReloadHeaderName), null);
    } finally {
      await server.close();
    }
  });

  it("injects the reload script into a page a browser asked for", async () => {
    // Given a served site with live reload on
    const simAws = new SimAws();
    const server = await serveSimAws({ simAws, liveReload: true });

    try {
      await simServedSite(simAws, "reload-site", page);

      // When a browser asks for the page
      const response = await simBrowserFetch(
        simServedSiteUrl(simAws, server, "reload-site"),
      );
      const body = await response.text();

      // Then the script is in it, at the end of the document
      assertIdentical(
        response.headers.get(simLiveReloadHeaderName),
        "injected",
      );
      assertStringIncludes(body, "<script data-sim-aws-live-reload>");
      assertStringIncludes(body, "</script></body></html>");

      // And the headers describe the bytes that were actually sent
      assertIdentical(
        response.headers.get("content-length"),
        String(Buffer.byteLength(body)),
      );
    } finally {
      await server.close();
    }
  });

  it("gives an SDK the stored Object bytes", async () => {
    // Given a served site whose page is also readable as an S3 Object
    const simAws = new SimAws();
    const server = await serveSimAws({ simAws, liveReload: true });

    try {
      await simServedSite(simAws, "sdk-site", page);
      const s3Client = await simServedSiteS3Client(simAws, server, "sdk-site");

      // When an SDK client reads that Object
      const output = await s3Client.send(
        new GetObjectCommand({ Bucket: "sdk-site", Key: "index.html" }),
      );

      // Then it gets what was stored, with nothing injected
      assertIdentical(await output.Body?.transformToString(), page);
    } finally {
      await server.close();
    }
  });

  it("tells a connected browser which process it reached", async () => {
    // Given a browser connected to the reload channel
    const server = await serveSimAws({ liveReload: true });

    try {
      const channel = await SimLiveReloadChannel.open(server);

      // When it reads the first event
      const event = await channel.nextEvent();

      // Then it is the boot id of this process
      assertIdentical(event.event, "boot");
      assertStringLength(event.data, 36);
      channel.close();
    } finally {
      await server.close();
    }
  });

  it("reloads a connected browser on reload()", async () => {
    // Given a browser connected to the reload channel
    const server = await serveSimAws({ liveReload: true });

    try {
      const channel = await SimLiveReloadChannel.open(server);
      await channel.nextEvent();

      // When the server is told to reload
      server.reload();

      // Then the browser is told to reload
      const event = await channel.nextEvent();
      assertIdentical(event.event, "reload");
      channel.close();
    } finally {
      await server.close();
    }
  });

  it("says a reload is coming before it stops serving", async () => {
    // Given a browser connected to the reload channel
    const server = await serveSimAws({ liveReload: true });
    const channel = await SimLiveReloadChannel.open(server);
    await channel.nextEvent();

    // When the server closes, as it does on the way to a restart
    await server.close();

    // Then the browser hears that rather than only losing the connection
    const event = await channel.nextEvent();
    assertIdentical(event.event, "reloading");
    channel.close();
  });

  it("says a reload is coming to a browser reading over a socket", async () => {
    // Given a browser on a real socket, holding bytes it has not read yet, the
    // way one does between the server sending an event and the page seeing it
    const server = await serveSimAws({ liveReload: true });
    const channel = await SimLiveReloadSocket.open(server);
    channel.stopReading();

    // When the server closes, as it does on the way to a restart
    await server.close();

    // Then the event survives the connection going, and the stream is finished
    // rather than cut off, so the browser reconnects
    const stream = await channel.readToEnd();
    assertStringIncludes(stream, "event: reloading");
    assertStringEndsWith(stream, "0\r\n\r\n");
  });

  it("has the event out of the process by the time closing settles", async () => {
    // Given a browser connected to the reload channel over a real socket
    const server = await serveSimAws({ liveReload: true });
    const channel = await SimLiveReloadSocket.open(server);

    // When the server closes and the caller waits for it, as a script that
    // means to exit rather than let the event loop empty has to
    await server.close();

    // Then the browser already has the event, so exiting now costs it nothing
    assertStringIncludes(channel.read(), "event: reloading");
    channel.close();
  });

  it("closes twice with no browser connected", async () => {
    // Given a server with live reload on, on a pinned port, and nothing
    // connected to it
    const server = await serveSimAws({ liveReload: true });
    const pinnedPort = Number(server.port);

    // When it is closed, and closed again, as a handler that fires twice does
    await server.close();
    await server.close();

    // Then both completed and the port went with the first, so waiting on the
    // reload streams costs nothing when there are none
    const replacement = await serveSimAws({ port: pinnedPort });
    assertIdentical(replacement.port, String(pinnedPort));
    await replacement.close();
  });

  it("refuses reload() when live reload is off", async () => {
    // Given a served environment with live reload not asked for
    const server = await serveSimAws();

    try {
      // When a reload is asked for anyway
      const error = assertThrowsError(() => {
        server.reload();
      });

      // Then it says what to turn on
      assertStringIncludes(error.message, "{ liveReload: true }");
    } finally {
      await server.close();
    }
  });
});

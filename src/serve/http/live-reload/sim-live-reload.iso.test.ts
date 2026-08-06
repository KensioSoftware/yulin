import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  assertFalse,
  assertIdentical,
  assertStringIncludes,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimLiveReload } from "./sim-live-reload.js";
import { simLiveReloadConfig } from "./sim-live-reload.config.js";

const bootId = "boot-id-for-this-process";

describe("SimLiveReload", () => {
  it("recognises a request for the reload channel", () => {
    // Given a live reload channel
    const liveReload = new SimLiveReload({ bootId });

    // When a browser asks for the reserved path
    const channelRequest = liveReload.isChannelRequest(
      browserRequest(simLiveReloadConfig.channelPath),
    );

    // Then it is answered here rather than by a simulated service
    assertTrue(channelRequest);
  });

  it("recognises the reload channel with a trailing slash", () => {
    // Given a live reload channel
    const liveReload = new SimLiveReload({ bootId });

    // When a browser asks for the reserved path with a slash on the end
    const channelRequest = liveReload.isChannelRequest(
      browserRequest(`${simLiveReloadConfig.channelPath}/?v=1`),
    );

    // Then it is still the channel
    assertTrue(channelRequest);
  });

  it("leaves any other path to the simulated services", () => {
    // Given a live reload channel
    const liveReload = new SimLiveReload({ bootId });

    // When a browser asks for an ordinary page
    const channelRequest = liveReload.isChannelRequest(
      browserRequest("/index.html"),
    );

    // Then live reload has nothing to do with it
    assertFalse(channelRequest);
  });

  it("leaves a write to the reserved path to the simulated services", () => {
    // Given a live reload channel
    const liveReload = new SimLiveReload({ bootId });

    // When something posts to the reserved path
    const channelRequest = liveReload.isChannelRequest(
      browserRequest(simLiveReloadConfig.channelPath, "POST"),
    );

    // Then it is not a request to read the channel
    assertFalse(channelRequest);
  });

  it("tells a connecting browser which process it reached", () => {
    // Given a live reload channel
    const liveReload = new SimLiveReload({ bootId });
    const response = new FakeServerResponse();

    // When a browser connects
    liveReload.connect(response.asNodeResponse());

    // Then it is told how soon to come back, and what it has reached
    assertIdentical(response.status, 200);
    assertIdentical(response.headers["content-type"], "text/event-stream");
    assertStringIncludes(
      response.written(),
      `retry: ${String(simLiveReloadConfig.clientRetryMs)}`,
    );
    assertStringIncludes(response.written(), `event: boot\ndata: ${bootId}`);
  });

  it("reloads every connected browser", () => {
    // Given two connected browsers
    const liveReload = new SimLiveReload({ bootId });
    const first = new FakeServerResponse();
    const second = new FakeServerResponse();
    liveReload.connect(first.asNodeResponse());
    liveReload.connect(second.asNodeResponse());

    // When a reload is asked for
    liveReload.reload();

    // Then both are told to reload
    assertStringIncludes(first.written(), "event: reload");
    assertStringIncludes(second.written(), "event: reload");
  });

  it("says a reload is coming, then ends the connection", async () => {
    // Given a connected browser
    const liveReload = new SimLiveReload({ bootId });
    const response = new FakeServerResponse();
    liveReload.connect(response.asNodeResponse());

    // When the server is stopping
    await liveReload.stopping();

    // Then the browser hears about it and is let go, so it reconnects
    assertStringIncludes(response.written(), "event: reloading");
    assertTrue(response.writableEnded);
  });

  it("forgets a browser that has gone away", () => {
    // Given a browser that connected and then closed the connection
    const liveReload = new SimLiveReload({ bootId });
    const response = new FakeServerResponse();
    liveReload.connect(response.asNodeResponse());
    const onConnect = response.written();
    response.emit("close");

    // When a reload is asked for
    liveReload.reload();

    // Then nothing more is written to it
    assertIdentical(response.written(), onConnect);
  });

  it("writes nothing to a connection that has already finished", () => {
    // Given a connected browser whose response has been ended
    const liveReload = new SimLiveReload({ bootId });
    const response = new FakeServerResponse();
    liveReload.connect(response.asNodeResponse());
    liveReload.connect(response.asNodeResponse());
    response.end();
    const onConnect = response.written();

    // When a reload is asked for
    liveReload.reload();

    // Then the finished response is left alone rather than written to
    assertIdentical(response.written(), onConnect);
  });

  it("leaves a finished connection alone when stopping", async () => {
    // Given a connected browser whose response has already finished
    const liveReload = new SimLiveReload({ bootId });
    const response = new FakeServerResponse();
    liveReload.connect(response.asNodeResponse());
    response.end();
    const onConnect = response.written();

    // When the server stops
    await liveReload.stopping();

    // Then there is nothing to say to it and nothing to end
    assertIdentical(response.written(), onConnect);
  });
});

function browserRequest(url: string, method = "GET"): IncomingMessage {
  return { method, url } as IncomingMessage;
}

/**
 * Just enough of a Node response for the channel to write events to.
 */
// eslint-disable-next-line unicorn/prefer-event-target
class FakeServerResponse extends EventEmitter {
  status = 0;
  headers: Record<string, string> = {};
  writableEnded = false;
  // No socket, as a response that never went over one has none, which is what
  // tells the channel there is no connection to see out.
  readonly socket = null;

  private readonly chunks: string[] = [];

  writeHead(status: number, headers: Record<string, string>): this {
    this.status = status;
    this.headers = headers;

    return this;
  }

  write(chunk: string): boolean {
    this.chunks.push(chunk);

    return true;
  }

  end(onFinished?: () => void): void {
    this.writableEnded = true;
    onFinished?.();
  }

  written(): string {
    return this.chunks.join("");
  }

  asNodeResponse(): ServerResponse {
    return this as unknown as ServerResponse;
  }
}

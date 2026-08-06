import type { ServerResponse } from "node:http";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsError,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it, vi } from "vitest";
import { SimLocalLiveReload } from "./sim-local-live-reload.js";
import { simWatchMessages } from "../../../watch/sim-watch.config.js";
import { SimWatchRuntime } from "../../../watch/sim-watch-runtime.js";
import { FakeProcess } from "../../../../test/watch/fake-process.js";

describe("SimLocalLiveReload", () => {
  it("has no channel when live reload is off", () => {
    // Given a server serving without live reload
    const liveReload = new SimLocalLiveReload({ enabled: false });

    // When the request handler asks for the channel
    const channel = liveReload.channel();

    // Then there is nothing to inject into responses with
    assertUndefined(channel);
  });

  it("says nothing on startup when live reload is off", () => {
    // Given a server serving without live reload
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const liveReload = new SimLocalLiveReload({ enabled: false });

    // When it starts listening
    liveReload.serving("8787");

    // Then the terminal is left alone, since nothing has changed
    assertUndefined(warn.mock.calls[0]);
  });

  it("refuses a reload when live reload is off", () => {
    // Given a server serving without live reload
    const liveReload = new SimLocalLiveReload({ enabled: false });

    // When a reload is asked for anyway
    const error = assertThrowsError(() => {
      liveReload.reload();
    });

    // Then it says what to turn on
    assertStringIncludes(error.message, "{ liveReload: true }");
  });

  it("refuses a reload it is checked for when live reload is off", () => {
    // Given a server serving without live reload, handed to something that
    // will want to reload it later
    const liveReload = new SimLocalLiveReload({ enabled: false });

    // When it is asked whether a reload would get anywhere
    const error = assertThrowsError(() => {
      liveReload.checkReload();
    });

    // Then it refuses now what it would refuse on the first change, which is
    // where the mistake can still be seen
    assertStringIncludes(error.message, "{ liveReload: true }");
  });

  it("takes a reload it is checked for when live reload is on", () => {
    // Given a server serving with live reload
    const liveReload = new SimLocalLiveReload({ enabled: true });

    // When it is asked whether a reload would get anywhere
    liveReload.checkReload();

    // Then nothing is refused, since the channel a reload goes down is there
    assertNonNullable(liveReload.channel());
  });

  it("warns connected browsers when a supervisor is about to restart", () => {
    // Given a served page under a `yulin watch` supervisor
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const host = new FakeProcess();
    const liveReload = new SimLocalLiveReload({
      enabled: true,
      watch: new SimWatchRuntime({ host }),
    });
    liveReload.serving("8787");
    const page = new FakeServerResponse();
    liveReload.channel()?.connect(page.asNodeResponse());

    // When the supervisor says the process is going
    host.deliver({ type: simWatchMessages.stopping });

    // Then the page hears that a reload is coming, rather than only losing its
    // connection when the process is killed
    assertStringIncludes(page.written(), "event: reloading");
  });

  it("stops listening for a supervisor once the server has closed", async () => {
    // Given a page that was connected to a server which has since closed
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const host = new FakeProcess();
    const liveReload = new SimLocalLiveReload({
      enabled: true,
      watch: new SimWatchRuntime({ host }),
    });
    liveReload.serving("8787");
    const page = new FakeServerResponse();
    liveReload.channel()?.connect(page.asNodeResponse());
    await liveReload.stopping();
    const afterClosing = page.written();
    const before = host.sent.length;

    // When the supervisor says the process is going
    host.deliver({ type: simWatchMessages.stopping });

    // Then nothing is left holding a reference to a closed server, and the
    // page it was serving is written to no further
    assertUndefined(host.sent.at(before));
    assertIdentical(page.written(), afterClosing);
  });
});

/**
 * Just enough of a Node response for the channel to write events to.
 */
class FakeServerResponse {
  writableEnded = false;
  // No socket, as a response that never went over one has none, which is what
  // tells the channel there is no connection to see out.
  readonly socket = null;

  private readonly chunks: string[] = [];

  writeHead(): this {
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

  on(): this {
    return this;
  }

  written(): string {
    return this.chunks.join("");
  }

  asNodeResponse(): ServerResponse {
    return this as unknown as ServerResponse;
  }
}

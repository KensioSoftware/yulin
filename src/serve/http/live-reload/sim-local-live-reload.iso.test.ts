import type { ServerResponse } from "node:http";
import {
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

  it("stops listening for a supervisor once the server has closed", () => {
    // Given a served page under a supervisor, whose server then closed
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const host = new FakeProcess();
    const liveReload = new SimLocalLiveReload({
      enabled: true,
      watch: new SimWatchRuntime({ host }),
    });
    liveReload.serving("8787");
    liveReload.stopping();

    // When the supervisor says the process is going
    const before = host.sent.length;
    host.deliver({ type: simWatchMessages.stopping });

    // Then nothing is left holding a reference to a closed server
    assertUndefined(host.sent.at(before));
  });
});

/**
 * Just enough of a Node response for the channel to write events to.
 */
class FakeServerResponse {
  writableEnded = false;

  private readonly chunks: string[] = [];

  writeHead(): this {
    return this;
  }

  write(chunk: string): boolean {
    this.chunks.push(chunk);

    return true;
  }

  end(): void {
    this.writableEnded = true;
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

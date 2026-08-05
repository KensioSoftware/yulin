import type { ServerResponse } from "node:http";
import { simLiveReloadConfig } from "./sim-live-reload.config.js";

/**
 * One browser holding a live reload connection open.
 *
 * Server-Sent Events rather than a WebSocket, because the browser reconnects on
 * its own. That is what lets a reload survive the process restarting: the
 * outgoing process has nothing to hand over, and the incoming one has nothing
 * to pick up.
 */
export class SimLiveReloadClient {
  private readonly response: ServerResponse;

  constructor(response: ServerResponse) {
    this.response = response;
  }

  /**
   * Start the event stream, telling the browser how soon to come back.
   */
  open(): void {
    this.response.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
    });
    this.write(`retry: ${String(simLiveReloadConfig.clientRetryMs)}\n\n`);
  }

  /**
   * Send one named event.
   */
  send(event: string, data: string): void {
    this.write(`event: ${event}\ndata: ${data}\n\n`);
  }

  /**
   * Finish the stream, so the browser reconnects rather than waiting on a
   * connection nothing is going to answer on.
   */
  end(): void {
    if (this.response.writableEnded) {
      return;
    }

    this.response.end();
  }

  /**
   * Run something when the browser goes away.
   */
  onClose(listener: () => void): void {
    this.response.on("close", listener);
  }

  private write(chunk: string): void {
    if (this.response.writableEnded) {
      return;
    }

    this.response.write(chunk);
  }
}

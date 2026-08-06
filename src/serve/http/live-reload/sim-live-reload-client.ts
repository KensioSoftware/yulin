import { once } from "node:events";
import type { ServerResponse } from "node:http";
import type { Socket } from "node:net";
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
   * Finish the stream and see its connection out, so the browser reconnects
   * rather than waiting on a connection nothing is going to answer on.
   *
   * Waiting is what makes the last event readable. A socket destroyed with
   * bytes still in flight is reset rather than closed, and a reset tells the
   * peer to throw away what it has received but not yet handed to the page,
   * which is the event that was just written. Ending the socket puts a normal
   * close after the bytes instead, and resolving once it has gone leaves the
   * server nothing left to destroy.
   */
  async end(): Promise<void> {
    const { socket } = this.response;

    if (!this.response.writableEnded) {
      await new Promise<void>((resolve) => {
        this.response.end(resolve);
      });
    }

    if (socket === null || socket.destroyed) {
      return;
    }

    socket.end();

    await this.closed(socket);
  }

  /**
   * Run something when the browser goes away.
   */
  onClose(listener: () => void): void {
    this.response.on("close", listener);
  }

  /**
   * Wait for a connection to go, giving up on a browser that is no longer
   * answering rather than holding the process open for it.
   */
  private async closed(socket: Socket): Promise<void> {
    try {
      await once(socket, "close", {
        signal: AbortSignal.timeout(simLiveReloadConfig.stoppingCloseMs),
      });
    } catch {
      // Either the connection failed on its way out or the browser never
      // answered. Nothing is owed to a page that is not there, and the server
      // destroys whatever is left of the connection anyway.
    }
  }

  private write(chunk: string): void {
    if (this.response.writableEnded) {
      return;
    }

    this.response.write(chunk);
  }
}

import { once } from "node:events";
import net from "node:net";
import { simLiveReloadConfig } from "../../src/serve/http/live-reload/sim-live-reload.config.js";
import { simAwsLocalConfig } from "../../src/serve/http/local-server/sim-aws-local.config.js";
import type { SimAwsLocalServer } from "../../src/serve/http/local-server/sim-aws-local-server.js";

/**
 * Reads the live reload channel over a plain TCP socket, the way a browser
 * does, rather than with the same-process `fetch` the other tests here use.
 *
 * The difference is what the connection going costs. `fetch` is handed bytes as
 * it decodes them, on the same event loop as the server that sent them, so it
 * is a forgiving reader of a stream that is closing. A browser is at the other
 * end of a socket, and what it has been sent is only what actually left this
 * end before the socket went. That is the reader worth testing against.
 */
export class SimLiveReloadSocket {
  private readonly socket: net.Socket;
  private received = "";

  private constructor(socket: net.Socket) {
    this.socket = socket;

    // A connection that is reset rather than closed reaches this end as an
    // error, which an unwatched socket throws on. It is one of the things being
    // measured, so it is left to the events to report rather than allowed to
    // end the test run.
    socket.on("error", () => {
      // Whatever arrived before it is what a browser would have had.
    });
    socket.on("data", (chunk: Buffer) => {
      this.received += chunk.toString("utf8");
    });
  }

  /**
   * Connect to the channel a local server is serving, and wait for the stream
   * to open, so the server has this browser on its list.
   */
  static async open(server: SimAwsLocalServer): Promise<SimLiveReloadSocket> {
    const socket = net.createConnection({
      host: simAwsLocalConfig.loopbackAddress,
      port: Number(server.port),
    });

    await once(socket, "connect");

    const channel = new SimLiveReloadSocket(socket);
    socket.write(
      `GET ${simLiveReloadConfig.channelPath} HTTP/1.1\r\n` +
        `Host: ${simAwsLocalConfig.hostname}\r\n` +
        "Accept: text/event-stream\r\n\r\n",
    );
    await once(socket, "data");

    return channel;
  }

  /**
   * Everything the server has sent so far.
   */
  read(): string {
    return this.received;
  }

  /**
   * Stop taking bytes off the connection, leaving anything sent from now on
   * where a browser that has not read it yet would be holding it.
   */
  stopReading(): void {
    this.socket.pause();
  }

  /**
   * Read everything the server sent, up to the connection going.
   */
  async readToEnd(): Promise<string> {
    this.socket.resume();

    try {
      await once(this.socket, "close");
    } catch {
      // The connection was reset rather than closed. What arrived before that
      // is all a browser would have to work with, which is the point of reading
      // it over a socket.
    }

    return this.received;
  }

  /**
   * Let the connection go without waiting for the server to end it.
   */
  close(): void {
    this.socket.destroy();
  }
}

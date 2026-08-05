import { assertNonNullable } from "@kensio/smartass";
import { simLiveReloadConfig } from "../../src/serve/http/live-reload/sim-live-reload.config.js";
import type { SimAwsLocalServer } from "../../src/serve/http/local-server/sim-aws-local-server.js";

/**
 * One named event read off the live reload channel.
 */
export interface SimLiveReloadEvent {
  readonly event: string;
  readonly data: string;
}

/**
 * Reads the live reload channel the way the injected script does, without a
 * browser. Node has no `EventSource`, and the wire format is small enough that
 * reading it directly says more about what the server sent than a client
 * library would.
 */
export class SimLiveReloadChannel {
  private readonly abort: AbortController;
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  private readonly decoder = new TextDecoder();
  private buffered = "";

  private constructor(
    abort: AbortController,
    reader: ReadableStreamDefaultReader<Uint8Array>,
  ) {
    this.abort = abort;
    this.reader = reader;
  }

  /**
   * Connect to the channel a local server is serving.
   */
  static async open(server: SimAwsLocalServer): Promise<SimLiveReloadChannel> {
    const abort = new AbortController();
    const response = await fetch(
      `http://${server.hostname}:${server.port}${simLiveReloadConfig.channelPath}`,
      { signal: abort.signal },
    );

    assertNonNullable(response.body);

    return new SimLiveReloadChannel(abort, response.body.getReader());
  }

  /**
   * Read the next named event, passing over the stream's own bookkeeping lines.
   */
  async nextEvent(): Promise<SimLiveReloadEvent> {
    const event = parseEvent(await this.nextBlock());

    if (event === undefined) {
      return this.nextEvent();
    }

    return event;
  }

  /**
   * Stop reading and let the connection go.
   */
  close(): void {
    this.abort.abort();
  }

  private async nextBlock(): Promise<string> {
    const end = this.buffered.indexOf("\n\n");

    if (end !== -1) {
      const block = this.buffered.slice(0, end);
      this.buffered = this.buffered.slice(end + 2);

      return block;
    }

    const { value, done } = await this.reader.read();

    if (done) {
      throw new Error("Live reload channel ended before the expected event");
    }

    this.buffered += this.decoder.decode(value, { stream: true });

    return this.nextBlock();
  }
}

function parseEvent(block: string): SimLiveReloadEvent | undefined {
  const lines = block.split("\n");
  const event = fieldValue(lines, "event");

  if (event === undefined) {
    return undefined;
  }

  return { event, data: fieldValue(lines, "data") ?? "" };
}

function fieldValue(lines: string[], field: string): string | undefined {
  const prefix = `${field}: `;
  const line = lines.find((candidate) => candidate.startsWith(prefix));

  if (line === undefined) {
    return undefined;
  }

  return line.slice(prefix.length);
}

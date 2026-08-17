import { STATUS_CODES } from "node:http";
import { Readable, Writable } from "node:stream";
import type {
  SimSdkWireHandler,
  SimSdkWireResponse,
} from "../../../../../../sdk/wire/sim-sdk-wire.types.js";
import type { SimLambdaVmHttpTarget } from "./sim-lambda-vm-http-target.js";

/**
 * What an HTTP client library reads off a response.
 */
interface SimLambdaVmWireResponseMessage extends Readable {
  statusCode: number;
  statusMessage: string;
  headers: Record<string, string>;
}

/**
 * The outgoing request object `http.request` hands back, for a request the
 * simulation answers instead of the network.
 *
 * It is a writable stream, which is what an HTTP client library expects: it
 * writes the request body and ends the stream, and the response arrives on the
 * `response` event. Nothing is connected to anything, so the request is
 * answered when the body is complete, and the timeout and socket controls a
 * client may reach for do nothing rather than being absent, since there is no
 * socket to time out.
 */
export class SimLambdaVmWireRequest extends Writable {
  private readonly chunks: Buffer[] = [];

  constructor(
    private readonly target: SimLambdaVmHttpTarget,
    private readonly handler: SimSdkWireHandler,
  ) {
    super();
  }

  override _write(
    chunk: unknown,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.chunks.push(Buffer.from(chunk as Uint8Array));
    callback();
  }

  /**
   * Answer the request once its body is complete.
   *
   * A request the simulation cannot route fails the stream, which is the same
   * `error` event a client would see from a connection that went nowhere, and
   * carries the explanation with it.
   */
  override _final(callback: (error?: Error | null) => void): void {
    void this.answer(callback);
  }

  /**
   * Accept the socket timeout a client sets, with no socket to apply it to.
   */
  setTimeout(): this {
    return this;
  }

  setNoDelay(): this {
    return this;
  }

  setSocketKeepAlive(): this {
    return this;
  }

  private async answer(
    callback: (error?: Error | null) => void,
  ): Promise<void> {
    try {
      const response = await this.handler({
        method: this.target.method,
        hostname: this.target.hostname,
        path: this.target.path,
        headers: this.target.headers,
        body: Buffer.concat(this.chunks),
      });

      this.emit("response", wireResponseMessage(response));
      callback();
    } catch (error) {
      callback(error as Error);
    }
  }
}

/**
 * Present a simulated response as the incoming message an HTTP client reads.
 */
function wireResponseMessage(
  response: SimSdkWireResponse,
): SimLambdaVmWireResponseMessage {
  const message = Readable.from([Buffer.from(response.body)], {
    objectMode: false,
  }) as SimLambdaVmWireResponseMessage;

  message.statusCode = response.statusCode;
  message.statusMessage = STATUS_CODES[response.statusCode] ?? "";
  message.headers = { ...response.headers };

  return message;
}

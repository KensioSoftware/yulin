import { Writable } from "node:stream";
import { simLambdaHttpResponseMessage } from "./sim-lambda-http-response.js";
import type { SimLambdaHttpTarget } from "./sim-lambda-http-target.js";
import type { SimLambdaOutboundHttp } from "./sim-lambda-outbound-http.js";

/**
 * The methods that carry no request body, which a request may not be built
 * with one for.
 */
const bodilessMethods: ReadonlySet<string> = new Set(["GET", "HEAD"]);

interface SimLambdaHttpRequestProperties {
  readonly target: SimLambdaHttpTarget;
  readonly outbound: SimLambdaOutboundHttp;

  /**
   * The scheme of the transport module the call was made through, which
   * stands in when the call itself named none.
   */
  readonly scheme: string;
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
export class SimLambdaHttpRequest extends Writable {
  private readonly chunks: Buffer[] = [];

  constructor(private readonly properties: SimLambdaHttpRequestProperties) {
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
      const response = await this.properties.outbound.fetch(this.request());

      this.emit("response", await simLambdaHttpResponseMessage(response));
      callback();
    } catch (error) {
      callback(error as Error);
    }
  }

  /**
   * The written request, as the request the simulation is asked to answer.
   */
  private request(): Request {
    const { target, scheme } = this.properties;
    const url = new URL(
      `${target.scheme ?? scheme}//${target.hostname}${target.path}`,
    );
    const body = Buffer.concat(this.chunks);

    return new Request(url, {
      method: target.method,
      headers: target.headers,
      ...(!bodilessMethods.has(target.method.toUpperCase()) && { body }),
    });
  }
}

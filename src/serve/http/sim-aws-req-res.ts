import type { IncomingMessage, ServerResponse } from "node:http";
import { assertDefined } from "../../util/defined.js";

/**
 * Wrapper for node:http request IncomingMessage for simulated AWS local server.
 */
export class SimAwsHttpRequest {
  constructor(private readonly nodeRequest: IncomingMessage) {}

  /**
   * HTTP method for this local request.
   */
  get method(): string | undefined {
    return this.nodeRequest.method;
  }

  /**
   * Get the URL or relative path for this local request.
   */
  get url(): string {
    return this.nodeRequest.url ?? "/";
  }

  /**
   * Hostname for this local request (ending in .simaws.localhost).
   */
  get host(): string {
    assertDefined(
      this.nodeRequest.headers.host,
      "Sim AWS HTTP request nodeRequest.headers.host",
    );
    return this.nodeRequest.headers.host;
  }

  /**
   * Construct a URL with host.
   */
  urlWithHost(): URL {
    return new URL(this.url, `http://${this.host}`);
  }
}

/**
 * Wrapper for node:http ServerResponse for simulated AWS local server.
 */
export class SimAwsHttpResponse {
  constructor(private readonly nodeResponse: ServerResponse) {}

  /**
   * Send a response from simulated AWS.
   */
  send(
    statusCode: number,
    body?: string | Buffer,
    headers: Record<string, string | number> = {},
  ): void {
    this.nodeResponse.writeHead(statusCode, {
      ...headers,
      ...(body === undefined
        ? {}
        : { "content-length": Buffer.byteLength(body) }),
    });
    this.nodeResponse.end(body);
  }

  /**
   * Send a text response from simulated AWS.
   */
  sendText(statusCode: number, body: string): void {
    this.send(statusCode, body, {
      "content-type": "text/plain; charset=utf-8",
    });
  }

  /**
   * Send a response to a HEAD request.
   */
  sendHead(
    statusCode: number,
    headers: Record<string, string | number> = {},
  ): void {
    this.nodeResponse.writeHead(statusCode, headers);
    this.nodeResponse.end();
  }
}

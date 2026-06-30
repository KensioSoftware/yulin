import type { IncomingMessage, ServerResponse } from "node:http";
import { assertDefined } from "../../util/type-guard/defined.js";

/**
 * Adapter between Node HTTP primitives and Fetch API primitives.
 */
export class NodeFetchHttpAdapter {
  /**
   * Convert a Node HTTP request into a Fetch API Request.
   */
  nodeRequestToFetchRequest(nodeRequest: IncomingMessage): Request {
    const host = nodeRequest.headers.host;
    assertDefined(host, "local sim server nodeRequest.headers.host required");
    const url = new URL(nodeRequest.url ?? "/", `http://${host}`);

    return new Request(url, {
      method: nodeRequest.method,
      headers: this.nodeRequestHeaders(nodeRequest),
      body: this.nodeRequestBody(nodeRequest),
      duplex: this.nodeRequestDuplex(nodeRequest),
    } as RequestInit);
  }

  /**
   * Send a Fetch API Response through a Node HTTP response.
   */
  async sendFetchResponse(
    nodeResponse: ServerResponse,
    response: Response,
  ): Promise<void> {
    nodeResponse.writeHead(
      response.status,
      Object.fromEntries(response.headers.entries()),
    );

    if (response.body === null) {
      nodeResponse.end();
      return;
    }

    const body = Buffer.from(await response.arrayBuffer());
    nodeResponse.end(body);
  }

  private nodeRequestHeaders(nodeRequest: IncomingMessage): Headers {
    const headers = new Headers();

    for (const [name, value] of Object.entries(nodeRequest.headers)) {
      /* v8 ignore if -- does not happen in practice */
      if (value === undefined) {
        continue;
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          headers.append(name, item);
        }
        continue;
      }

      headers.set(name, value);
    }

    return headers;
  }

  private nodeRequestBody(
    nodeRequest: IncomingMessage,
  ): IncomingMessage | undefined {
    if (this.requestMethodHasNoBody(nodeRequest)) {
      return undefined;
    }

    return nodeRequest;
  }

  private nodeRequestDuplex(nodeRequest: IncomingMessage): "half" | undefined {
    if (this.requestMethodHasNoBody(nodeRequest)) {
      return undefined;
    }

    return "half";
  }

  private requestMethodHasNoBody(nodeRequest: IncomingMessage): boolean {
    return nodeRequest.method === "GET" || nodeRequest.method === "HEAD";
  }
}

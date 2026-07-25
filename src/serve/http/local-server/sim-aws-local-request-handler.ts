import type { IncomingMessage, ServerResponse } from "node:http";
import { NodeFetchHttpAdapter } from "../node-fetch-http-adapter.js";
import type { SimAwsHttp } from "../sim-aws-http.js";

/**
 * Bridges Node's HTTP server callbacks to the Fetch-shaped simulated AWS HTTP
 * interface.
 *
 * Node hands over a request and a response object and expects nothing back,
 * while `SimAwsHttp` takes a `Request` and returns a `Response`. Keeping that
 * adaptation here leaves the local server owning only the socket lifecycle.
 */
export class SimAwsLocalRequestHandler {
  private readonly simAwsHttp: SimAwsHttp;
  private readonly nodeFetchHttpAdapter = new NodeFetchHttpAdapter();

  constructor(simAwsHttp: SimAwsHttp) {
    this.simAwsHttp = simAwsHttp;
  }

  /**
   * Handle one Node HTTP request, reporting any failure on the response rather
   * than letting it escape into an unhandled rejection.
   */
  handle(nodeRequest: IncomingMessage, nodeResponse: ServerResponse): void {
    // eslint-disable-next-line unicorn/prefer-await
    this.respond(nodeRequest, nodeResponse).catch((error: unknown) => {
      this.respondWithError(error, nodeResponse);
    });
  }

  private async respond(
    nodeRequest: IncomingMessage,
    nodeResponse: ServerResponse,
  ): Promise<void> {
    const request =
      this.nodeFetchHttpAdapter.nodeRequestToFetchRequest(nodeRequest);
    const response = await this.simAwsHttp.handleRequest(request);

    await this.nodeFetchHttpAdapter.sendFetchResponse(nodeResponse, response);
  }

  private respondWithError(error: unknown, nodeResponse: ServerResponse): void {
    /* v8 ignore if */
    if (nodeResponse.writableEnded) {
      return;
    }

    if (!nodeResponse.headersSent) {
      nodeResponse.statusCode = 400;
      nodeResponse.setHeader("content-type", "text/plain; charset=utf-8");
    }

    const message =
      error instanceof Error ? error.message : "HTTP request processing failed";

    nodeResponse.end(message);
  }
}

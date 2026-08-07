import type { IncomingMessage, ServerResponse } from "node:http";
import { NodeFetchHttpAdapter } from "../node-fetch-http-adapter.js";
import type { SimAwsHttp } from "../sim-aws-http.js";
import type { SimLiveReload } from "../live-reload/sim-live-reload.js";

interface SimAwsLocalRequestHandlerProperties {
  readonly simAwsHttp: SimAwsHttp;
  readonly liveReload?: SimLiveReload;
}

/**
 * Bridges Node's HTTP server callbacks to the Fetch-shaped simulated AWS HTTP
 * interface.
 *
 * Node hands over a request and a response object and expects nothing back,
 * while `SimAwsHttp` takes a `Request` and returns a `Response`. Keeping that
 * adaptation here leaves the local server owning only the socket lifecycle.
 *
 * Live reload sits either side of `SimAwsHttp` rather than inside it. That
 * interface is also the SDK interception path and the in-process test path, so
 * keeping the reload channel and the injected script out here means only a real
 * browser talking to the local server ever sees either of them.
 */
export class SimAwsLocalRequestHandler {
  private readonly simAwsHttp: SimAwsHttp;
  private readonly liveReload: SimLiveReload | undefined;
  private readonly nodeFetchHttpAdapter = new NodeFetchHttpAdapter();

  constructor(properties: SimAwsLocalRequestHandlerProperties) {
    const { simAwsHttp, liveReload } = properties;
    this.simAwsHttp = simAwsHttp;
    this.liveReload = liveReload;
  }

  /**
   * Handle one Node HTTP request, reporting any failure on the response rather
   * than letting it escape into an unhandled rejection.
   */
  handle(nodeRequest: IncomingMessage, nodeResponse: ServerResponse): void {
    if (this.liveReload?.isChannelRequest(nodeRequest) === true) {
      this.liveReload.connect(nodeResponse);
      return;
    }

    // oxlint-disable-next-line unicorn-js/prefer-await
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

    await this.nodeFetchHttpAdapter.sendFetchResponse(
      nodeResponse,
      await this.served(request, response),
    );
  }

  private async served(
    request: Request,
    response: Response,
  ): Promise<Response> {
    if (this.liveReload === undefined) {
      return response;
    }

    return this.liveReload.injectInto(request, response);
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

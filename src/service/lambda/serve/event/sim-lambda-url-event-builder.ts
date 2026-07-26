import { randomUUID } from "node:crypto";

import type { SimLambdaFunctionUrl } from "../../function/url/sim-lambda-function-url.js";
import { SimLambdaUrlBodyEncoding } from "./sim-lambda-url-body-encoding.js";
import type {
  SimLambdaFunctionUrlEvent,
  SimLambdaFunctionUrlRequestContext,
} from "./sim-lambda-url-event.type.js";
import { SimLambdaUrlRequestParts } from "./sim-lambda-url-request-parts.js";

/**
 * Builds the payload format 2.0 event a Function URL invocation passes to the
 * function handler.
 *
 * Real Function URLs only speak payload format 2.0, so there is no version to
 * choose. Request headers are passed through as received, including the local
 * Host, while the requestContext describes the AWS-shaped endpoint the URL
 * identifies.
 */
export class SimLambdaUrlEventBuilder {
  private readonly bodyEncoding = new SimLambdaUrlBodyEncoding();
  private readonly requestParts = new SimLambdaUrlRequestParts();

  /**
   * Build the invocation event for one Function URL request.
   */
  async build(
    request: Request,
    functionUrl: SimLambdaFunctionUrl,
  ): Promise<SimLambdaFunctionUrlEvent> {
    const url = new URL(request.url);
    const bytes = new Uint8Array(await request.arrayBuffer());
    const hasBody = bytes.length > 0;
    const contentType = request.headers.get("content-type");

    const event: SimLambdaFunctionUrlEvent = {
      version: "2.0",
      routeKey: "$default",
      rawPath: url.pathname,
      rawQueryString: url.search.replace(/^\?/, ""),
      headers: this.requestParts.headers(request),
      requestContext: this.requestContext(request, url, functionUrl),
      isBase64Encoded: hasBody && !this.bodyEncoding.isText(contentType),
    };

    const cookies = this.requestParts.cookies(request);
    if (cookies.length > 0) {
      event.cookies = cookies;
    }

    const queryStringParameters = this.requestParts.queryStringParameters(url);
    if (Object.keys(queryStringParameters).length > 0) {
      event.queryStringParameters = queryStringParameters;
    }

    if (hasBody) {
      event.body = this.bodyEncoding.encode(bytes, contentType);
    }

    return event;
  }

  private requestContext(
    request: Request,
    url: URL,
    functionUrl: SimLambdaFunctionUrl,
  ): SimLambdaFunctionUrlRequestContext {
    const now = new Date();

    return {
      // Function URLs report the caller as anonymous when the request was not
      // authenticated, which is every request the simulator serves.
      accountId: "anonymous",
      apiId: functionUrl.urlId,
      domainName: functionUrl.hostname,
      domainPrefix: functionUrl.urlId,
      http: {
        method: request.method,
        path: url.pathname,
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: request.headers.get("user-agent") ?? "",
      },
      requestId: randomUUID(),
      routeKey: "$default",
      stage: "$default",
      time: now.toISOString(),
      timeEpoch: now.getTime(),
    };
  }
}

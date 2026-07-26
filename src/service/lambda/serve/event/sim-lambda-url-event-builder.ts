import type { SimLambdaFunctionUrl } from "../../function/url/sim-lambda-function-url.js";
import { SimLambdaUrlBodyEncoding } from "./sim-lambda-url-body-encoding.js";
import type { SimLambdaFunctionUrlEvent } from "./sim-lambda-url-event.type.js";
import { SimLambdaUrlRequestParts } from "./sim-lambda-url-request-parts.js";
import { SimLambdaUrlRequestContextBuilder } from "./sim-lambda-url-request-context.js";
import type { SimAwsRequestCaller } from "../../../iam/request/sim-aws-request-caller.js";
import {
  type SimClock,
  SimRealClock,
} from "../../../../util/clock/sim-clock.js";

interface SimLambdaUrlEventBuilderProperties {
  /**
   * Clock stamping the event's requestContext time, so a handler sees the same
   * "now" as the rest of the simulation.
   */
  readonly clock?: SimClock;
}

/**
 * Builds the payload format 2.0 event a Function URL invocation passes to the
 * function handler.
 *
 * Real Function URLs only speak payload format 2.0, so there is no version to
 * choose. Request headers are passed through as received, including the local
 * Host, while the requestContext describes the AWS-shaped endpoint the URL
 * identifies and the caller, if any, that it authenticated.
 */
export class SimLambdaUrlEventBuilder {
  private readonly bodyEncoding = new SimLambdaUrlBodyEncoding();
  private readonly requestParts = new SimLambdaUrlRequestParts();
  private readonly requestContext: SimLambdaUrlRequestContextBuilder;

  constructor(properties: SimLambdaUrlEventBuilderProperties = {}) {
    this.requestContext = new SimLambdaUrlRequestContextBuilder(
      properties.clock ?? new SimRealClock(),
    );
  }

  /**
   * Build the invocation event for one Function URL request.
   *
   * A caller is supplied only when the Function URL authenticated one, which
   * is what makes the authorizer block present for an `AWS_IAM` invocation and
   * absent for a `NONE` one.
   */
  async build(
    request: Request,
    functionUrl: SimLambdaFunctionUrl,
    authenticatedCaller?: SimAwsRequestCaller,
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
      requestContext: this.requestContext.build({
        request,
        url,
        functionUrl,
        authenticatedCaller,
      }),
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
}

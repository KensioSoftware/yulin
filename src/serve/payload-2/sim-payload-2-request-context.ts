import { randomUUID } from "node:crypto";

import type { SimAwsRequestCaller } from "../../service/iam/request/sim-aws-request-caller.js";
import { simPayload2SourceIp } from "./sim-payload-2-connection.js";
import type { SimPayload2Endpoint } from "./sim-payload-2-endpoint.js";
import type { SimPayload2RequestContext } from "./sim-payload-2-event.type.js";
import { simPayload2EventTime } from "./sim-payload-2-event-time.js";
import {
  simPayload2AnonymousAccountId,
  SimPayload2IamCaller,
} from "./sim-payload-2-iam-caller.js";

interface SimPayload2RequestContextInput {
  readonly request: Request;
  readonly url: URL;
  readonly endpoint: SimPayload2Endpoint;
  /** The simulated instant the request is stamped with. */
  readonly at: Date;
  readonly authenticatedCaller?: SimAwsRequestCaller | undefined;
}

/**
 * Builds the requestContext block of a payload format 2.0 event.
 *
 * This describes the AWS-shaped endpoint the request reached and, when the
 * endpoint authorized one, the caller behind it. A caller is supplied only for
 * an endpoint that authenticates, which is what makes the authorizer block
 * present there and absent for an open endpoint, as it is on real AWS.
 */
export class SimPayload2RequestContextBuilder {
  /**
   * Build the requestContext for one request.
   */
  build(input: SimPayload2RequestContextInput): SimPayload2RequestContext {
    const { request, url, endpoint, at } = input;
    const iamCaller = this.iamCaller(input.authenticatedCaller);

    const requestContext: SimPayload2RequestContext = {
      // An unauthenticated request has no Account behind it, and that is what
      // AWS calls anonymous.
      accountId: iamCaller?.accountId() ?? simPayload2AnonymousAccountId,
      apiId: endpoint.apiId,
      domainName: endpoint.domainName,
      domainPrefix: endpoint.domainPrefix,
      http: {
        method: request.method,
        path: url.pathname,
        protocol: "HTTP/1.1",
        sourceIp: simPayload2SourceIp,
        userAgent: request.headers.get("user-agent") ?? "",
      },
      requestId: randomUUID(),
      routeKey: endpoint.routeKey,
      stage: endpoint.stage,
      time: simPayload2EventTime(at),
      timeEpoch: at.getTime(),
    };

    const authorizer = iamCaller?.authorizerContext();
    if (authorizer !== undefined) {
      requestContext.authorizer = authorizer;
    }

    return requestContext;
  }

  private iamCaller(
    caller: SimAwsRequestCaller | undefined,
  ): SimPayload2IamCaller | undefined {
    return caller === undefined ? undefined : new SimPayload2IamCaller(caller);
  }
}

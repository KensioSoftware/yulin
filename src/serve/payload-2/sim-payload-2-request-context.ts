import { randomUUID } from "node:crypto";

import type { SimAwsRequestCaller } from "../../service/iam/request/sim-aws-request-caller.js";
import { simAwsProxiedSourceIp } from "../http/sim-aws-proxied-connection.js";
import type { SimPayload2Endpoint } from "./sim-payload-2-endpoint.js";
import type {
  SimPayload2JwtAuthorizer,
  SimPayload2LambdaAuthorizer,
  SimPayload2RequestContext,
} from "./sim-payload-2-event.type.js";
import { simPayload2EventTime } from "./sim-payload-2-event-time.js";
import {
  simPayload2AnonymousAccountId,
  SimPayload2IamCaller,
} from "./sim-payload-2-iam-caller.js";

/**
 * What the endpoint's authorizer knows about the caller, if it authorized one.
 *
 * The two members are the two kinds of authorizer a payload format 2.0
 * endpoint has. Neither is present for an endpoint that admits anyone, which
 * is what leaves the authorizer block out of the event.
 */
export interface SimPayload2Authorization {
  /** The caller of a SigV4-signed request the endpoint authenticated. */
  readonly caller?: SimAwsRequestCaller | undefined;
  /** The token a JWT authorizer accepted. */
  readonly jwt?: SimPayload2JwtAuthorizer | undefined;
  /**
   * The context a Lambda `REQUEST` authorizer returned, which is `null` when
   * it allowed the request and returned none.
   */
  readonly lambda?: SimPayload2LambdaAuthorizer | null | undefined;
}

interface SimPayload2RequestContextInput {
  readonly request: Request;
  readonly url: URL;
  readonly endpoint: SimPayload2Endpoint;
  /** The simulated instant the request is stamped with. */
  readonly at: Date;
  readonly authorization?: SimPayload2Authorization | undefined;
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
    const iamCaller = this.iamCaller(input.authorization?.caller);

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
        sourceIp: simAwsProxiedSourceIp,
        userAgent: request.headers.get("user-agent") ?? "",
      },
      requestId: randomUUID(),
      routeKey: endpoint.routeKey,
      stage: endpoint.stage,
      time: simPayload2EventTime(at),
      timeEpoch: at.getTime(),
    };

    const jwt = input.authorization?.jwt;
    if (jwt !== undefined) {
      requestContext.authorizer = { jwt };
    }

    const lambda = input.authorization?.lambda;
    if (lambda !== undefined) {
      requestContext.authorizer = { lambda };
    }

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

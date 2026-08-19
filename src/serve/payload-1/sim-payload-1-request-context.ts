import { randomUUID } from "node:crypto";

import { simProxyEventTime } from "../proxy/sim-proxy-event-time.js";
import type { SimPayload1Endpoint } from "./sim-payload-1-endpoint.js";
import type {
  SimPayload1Identity,
  SimPayload1RequestContext,
} from "./sim-payload-1-event.type.js";

interface SimPayload1RequestContextInput {
  readonly request: Request;
  readonly url: URL;
  readonly endpoint: SimPayload1Endpoint;
  readonly sourceIp: string;
  readonly at: Date;
}

/**
 * Builds the `requestContext` of a payload format 1.0 event.
 *
 * This is what the REST API says about the request rather than what the client
 * sent. The resource fields name the tree node the path matched, which is what
 * lets a handler behind a `{proxy+}` tell which template caught it.
 */
export class SimPayload1RequestContextBuilder {
  /**
   * Build the request context for one request to an endpoint.
   */
  build(input: SimPayload1RequestContextInput): SimPayload1RequestContext {
    const { endpoint, url, at } = input;

    return {
      accountId: endpoint.accountId,
      apiId: endpoint.apiId,
      domainName: endpoint.domainName,
      domainPrefix: endpoint.apiId,
      extendedRequestId: randomUUID(),
      httpMethod: input.request.method,
      identity: this.identity(input),
      path: url.pathname,
      // Simulated endpoints are served over plain localhost HTTP, and this
      // describes the AWS endpoint the request names.
      protocol: "HTTP/1.1",
      requestId: randomUUID(),
      requestTime: simProxyEventTime(at),
      requestTimeEpoch: at.getTime(),
      resourceId: endpoint.resourceId,
      resourcePath: endpoint.resourcePath,
      stage: endpoint.stage,
    };
  }

  /**
   * Who API Gateway says made the request.
   *
   * Only the open case is described here. Authorizing a method is a separate
   * piece of work, and the fields an authorizer would fill stay `null` until
   * something fills them.
   */
  private identity(input: SimPayload1RequestContextInput): SimPayload1Identity {
    return {
      sourceIp: input.sourceIp,
      userAgent: input.request.headers.get("user-agent"),
      accessKey: null,
      accountId: null,
      apiKey: null,
      apiKeyId: null,
      caller: null,
      cognitoAuthenticationProvider: null,
      cognitoAuthenticationType: null,
      cognitoIdentityId: null,
      cognitoIdentityPoolId: null,
      principalOrgId: null,
      user: null,
      userArn: null,
    };
  }
}

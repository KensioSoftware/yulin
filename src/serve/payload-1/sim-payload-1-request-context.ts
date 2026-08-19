import { randomUUID } from "node:crypto";

import type { SimAwsRequestCaller } from "../../service/iam/request/sim-aws-request-caller.js";
import { simProxyEventTime } from "../proxy/sim-proxy-event-time.js";
import type { SimPayload1Endpoint } from "./sim-payload-1-endpoint.js";
import { SimPayload1IamCaller } from "./sim-payload-1-iam-caller.js";
import type {
  SimPayload1Identity,
  SimPayload1LambdaAuthorizer,
  SimPayload1RequestContext,
} from "./sim-payload-1-event.type.js";

/**
 * What the endpoint's authorization knows about the caller, if it authorized
 * one.
 *
 * A method admitting anybody supplies neither, which is what leaves the
 * authorizer block out of the event and every identity field describing a
 * principal `null`.
 */
export interface SimPayload1Authorization {
  /** The principal and the context a Lambda authorizer answered with. */
  readonly lambda?: SimPayload1LambdaAuthorizer | undefined;
  /** The caller an `AWS_IAM` method allowed the request. */
  readonly caller?: SimAwsRequestCaller | undefined;
}

interface SimPayload1RequestContextInput {
  readonly request: Request;
  readonly url: URL;
  readonly endpoint: SimPayload1Endpoint;
  readonly sourceIp: string;
  readonly at: Date;
  readonly authorization?: SimPayload1Authorization | undefined;
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

    const requestContext: SimPayload1RequestContext = {
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

    const { lambda } = input.authorization ?? {};

    if (lambda !== undefined) {
      requestContext.authorizer = lambda;
    }

    return requestContext;
  }

  /**
   * Who API Gateway says made the request.
   *
   * The fields naming a principal are filled for an `AWS_IAM` method, which is
   * the one authorization type that authenticates the caller itself, and are
   * `null` for every other method. The Cognito identity pool fields are `null`
   * throughout, as they are for any request that came without one.
   */
  private identity(input: SimPayload1RequestContextInput): SimPayload1Identity {
    return {
      sourceIp: input.sourceIp,
      userAgent: input.request.headers.get("user-agent"),
      accessKey: null,
      apiKey: null,
      apiKeyId: null,
      cognitoAuthenticationProvider: null,
      cognitoAuthenticationType: null,
      cognitoIdentityId: null,
      cognitoIdentityPoolId: null,
      principalOrgId: null,
      ...new SimPayload1IamCaller(input.authorization?.caller).identity(),
    };
  }
}

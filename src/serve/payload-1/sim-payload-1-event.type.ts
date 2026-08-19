/**
 * Who API Gateway says made the request.
 *
 * Real events carry every field, with `null` for the ones that do not apply,
 * which is why a handler reading `identity.userArn` on an open method finds
 * `null` rather than nothing at all.
 */
export interface SimPayload1Identity {
  sourceIp: string;
  userAgent: string | null;
  accessKey: string | null;
  accountId: string | null;
  apiKey: string | null;
  apiKeyId: string | null;
  caller: string | null;
  cognitoAuthenticationProvider: string | null;
  cognitoAuthenticationType: string | null;
  cognitoIdentityId: string | null;
  cognitoIdentityPoolId: string | null;
  principalOrgId: string | null;
  user: string | null;
  userArn: string | null;
}

/**
 * What a Lambda authorizer passed on to the handler.
 *
 * `principalId` is the name the authorizer chose for the caller, and every
 * other member is one the authorizer's own `context` carried. A REST API
 * flattens the two together, where payload format 2.0 keeps the context in a
 * block of its own.
 */
export interface SimPayload1LambdaAuthorizer {
  principalId?: string;
  [contextKey: string]: unknown;
}

/**
 * What payload format 1.0 says about the request beyond the request itself.
 */
export interface SimPayload1RequestContext {
  accountId: string;
  apiId: string;
  /**
   * What the method's authorizer knows about the caller. It is absent on a
   * method that authorizes nobody, which is what real API Gateway sends.
   */
  authorizer?: SimPayload1LambdaAuthorizer;
  domainName: string;
  domainPrefix: string;
  extendedRequestId: string;
  httpMethod: string;
  identity: SimPayload1Identity;
  /** The request path, stage segment and all. */
  path: string;
  protocol: string;
  requestId: string;
  requestTime: string;
  requestTimeEpoch: number;
  resourceId: string;
  /** The resource path template the request matched, without the stage. */
  resourcePath: string;
  stage: string;
}

/**
 * The event a REST API's Lambda proxy integration passes to the handler.
 *
 * The empty cases are `null` rather than absent, which is what real API
 * Gateway sends and what a handler checking `event.queryStringParameters ===
 * null` relies on. Payload format 2.0 leaves them out instead, and that
 * difference is the reason a handler written for one format cannot read the
 * other.
 */
export interface SimPayload1Event {
  resource: string;
  path: string;
  httpMethod: string;
  headers: Record<string, string> | null;
  multiValueHeaders: Record<string, string[]> | null;
  queryStringParameters: Record<string, string> | null;
  multiValueQueryStringParameters: Record<string, string[]> | null;
  pathParameters: Record<string, string> | null;
  stageVariables: Record<string, string> | null;
  requestContext: SimPayload1RequestContext;
  body: string | null;
  isBase64Encoded: boolean;
}

/**
 * The structured response a payload format 1.0 handler returns.
 */
export interface SimPayload1Result {
  statusCode?: number | undefined;
  headers?: Record<string, string | number | boolean> | undefined;
  multiValueHeaders?: Record<string, (string | number | boolean)[]> | undefined;
  body?: string | undefined;
  isBase64Encoded?: boolean | undefined;
}

/**
 * A handler result carrying the status code that makes it a structured
 * response.
 */
export interface SimPayload1StructuredResult extends SimPayload1Result {
  statusCode: number;
}

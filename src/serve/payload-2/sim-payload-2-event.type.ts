import type { JSONValue } from "../../util/type-guard/json.js";

/**
 * A Lambda proxy invocation event in API Gateway HTTP API payload format 2.0.
 *
 * Two simulated services build this same event: an HTTP API with an `AWS_PROXY`
 * integration, which is what the format is named after, and a Lambda Function
 * URL, which real Lambda documents as using the same format. The fields that
 * differ between them, such as the route key and the stage, are supplied by
 * whichever endpoint received the request.
 *
 * This is a minimal structural equivalent of the `aws-lambda` typings package's
 * `APIGatewayProxyEventV2` and `LambdaFunctionURLEvent`, so handlers typed
 * against that package can be invoked unchanged.
 */
export interface SimPayload2Event {
  version: "2.0";
  routeKey: string;
  rawPath: string;
  rawQueryString: string;
  cookies?: string[];
  headers: Record<string, string>;
  queryStringParameters?: Record<string, string>;
  pathParameters?: Record<string, string>;
  stageVariables?: Record<string, string>;
  requestContext: SimPayload2RequestContext;
  body?: string;
  isBase64Encoded: boolean;
}

/**
 * The requestContext block of a payload format 2.0 event.
 */
export interface SimPayload2RequestContext {
  accountId: string;
  apiId: string;
  authorizer?: SimPayload2AuthorizerContext;
  domainName: string;
  domainPrefix: string;
  http: SimPayload2HttpContext;
  requestId: string;
  routeKey: string;
  stage: string;
  time: string;
  timeEpoch: number;
}

/**
 * The requestContext.authorizer block, present only on an invocation the
 * endpoint authorized.
 *
 * An endpoint that admits anyone has no caller to describe, so real AWS leaves
 * this out entirely rather than filling it with blanks. Which member is
 * present says which kind of authorizer admitted the request: `iam` for a
 * SigV4-signed request, `jwt` for a JWT authorizer, `lambda` for a Lambda
 * `REQUEST` authorizer.
 */
export interface SimPayload2AuthorizerContext {
  iam?: SimPayload2IamAuthorizer;
  jwt?: SimPayload2JwtAuthorizer;
  lambda?: SimPayload2LambdaAuthorizer | null;
}

/**
 * The context a Lambda `REQUEST` authorizer passed on to the integration.
 *
 * The values arrive as the authorizer returned them rather than stringified,
 * which is what payload format 2.0 does with them: a REST API's `$context`
 * variables are strings, and this is not one of those. An authorizer that
 * allowed the request and returned no context at all leaves `null` here, so
 * the authorizer block is still there to say which kind of authorizer ran.
 */
export type SimPayload2LambdaAuthorizer = Readonly<Record<string, JSONValue>>;

/**
 * The IAM caller of a SigV4-authorized invocation.
 *
 * `userArn` and `accountId` describe the principal the request was attributed
 * to, which is what makes a handler able to behave differently for different
 * callers.
 *
 * `callerId` and `userId` carry the caller ARN rather than the opaque unique
 * id (`AIDA...`, `AROA...:session`) real AWS puts there: the simulator has no
 * unique-id namespace at the request boundary, and an ARN is what a test would
 * assert on anyway. `accessKey` is empty, as the simulator does not carry the
 * signing access key id past authentication. `cognitoIdentity` and
 * `principalOrgId` are always null, as neither is simulated.
 */
export interface SimPayload2IamAuthorizer {
  accessKey: string;
  accountId: string;
  callerId: string;
  cognitoIdentity: null;
  principalOrgId: null;
  userArn: string;
  userId: string;
}

/**
 * The JWT the endpoint's authorizer accepted, as it reaches the handler.
 *
 * `scopes` is null when the token carries no `scope` claim, which is what real
 * API Gateway puts there rather than an empty list.
 */
export interface SimPayload2JwtAuthorizer {
  claims: Record<string, string>;
  scopes: string[] | null;
}

/**
 * The requestContext.http block of a payload format 2.0 event.
 */
export interface SimPayload2HttpContext {
  method: string;
  path: string;
  protocol: string;
  sourceIp: string;
  userAgent: string;
}

/**
 * Structured handler result for a payload format 2.0 invocation.
 *
 * A handler may also return any other value, in which case real AWS infers a
 * 200 JSON response from it.
 */
export interface SimPayload2Result extends SimPayload2ResultBody {
  statusCode?: number | undefined;
}

/**
 * A handler result that carries a status code, which is what makes real AWS
 * treat it as an HTTP response rather than a value to JSON-encode.
 */
export interface SimPayload2StructuredResult extends SimPayload2ResultBody {
  statusCode: number;
}

interface SimPayload2ResultBody {
  headers?: Record<string, string | number | boolean> | undefined;
  cookies?: string[] | undefined;
  body?: string | undefined;
  isBase64Encoded?: boolean | undefined;
}

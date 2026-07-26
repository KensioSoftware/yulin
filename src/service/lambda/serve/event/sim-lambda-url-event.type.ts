/**
 * Lambda Function URL invocation event, in the API Gateway HTTP API payload
 * format 2.0 that real Function URLs use.
 *
 * This is a minimal structural equivalent of the `aws-lambda` typings
 * package's `LambdaFunctionURLEvent`, so handlers typed against that package
 * can be invoked unchanged.
 */
export interface SimLambdaFunctionUrlEvent {
  version: "2.0";
  routeKey: "$default";
  rawPath: string;
  rawQueryString: string;
  cookies?: string[];
  headers: Record<string, string>;
  queryStringParameters?: Record<string, string>;
  requestContext: SimLambdaFunctionUrlRequestContext;
  body?: string;
  isBase64Encoded: boolean;
}

/**
 * The requestContext block of a Function URL invocation event.
 */
export interface SimLambdaFunctionUrlRequestContext {
  accountId: string;
  apiId: string;
  authorizer?: SimLambdaFunctionUrlAuthorizerContext;
  domainName: string;
  domainPrefix: string;
  http: SimLambdaFunctionUrlHttpContext;
  requestId: string;
  routeKey: "$default";
  stage: "$default";
  time: string;
  timeEpoch: number;
}

/**
 * The requestContext.authorizer block, present only on an invocation a
 * Function URL authenticated.
 *
 * A `NONE` Function URL is invokable by anyone and has no caller to describe,
 * so real Lambda leaves this out entirely rather than filling it with blanks.
 */
export interface SimLambdaFunctionUrlAuthorizerContext {
  iam: SimLambdaFunctionUrlIamAuthorizer;
}

/**
 * The IAM caller of an `AWS_IAM` Function URL invocation.
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
export interface SimLambdaFunctionUrlIamAuthorizer {
  accessKey: string;
  accountId: string;
  callerId: string;
  cognitoIdentity: null;
  principalOrgId: null;
  userArn: string;
  userId: string;
}

/**
 * The requestContext.http block of a Function URL invocation event.
 */
export interface SimLambdaFunctionUrlHttpContext {
  method: string;
  path: string;
  protocol: string;
  sourceIp: string;
  userAgent: string;
}

/**
 * Structured handler result for a Function URL invocation.
 *
 * A handler may also return any other value, in which case real Lambda infers
 * a 200 JSON response from it.
 */
export interface SimLambdaFunctionUrlResult extends SimLambdaFunctionUrlResultBody {
  statusCode?: number | undefined;
}

/**
 * A handler result that carries a status code, which is what makes real
 * Lambda treat it as an HTTP response rather than a value to JSON-encode.
 */
export interface SimLambdaFunctionUrlStructuredResult extends SimLambdaFunctionUrlResultBody {
  statusCode: number;
}

interface SimLambdaFunctionUrlResultBody {
  headers?: Record<string, string | number | boolean> | undefined;
  cookies?: string[] | undefined;
  body?: string | undefined;
  isBase64Encoded?: boolean | undefined;
}

/**
 * The endpoint identity a payload format 2.0 event describes.
 *
 * An HTTP API and a Lambda Function URL build the same event from the same
 * request, and differ only in what they call themselves: the API id, the
 * hostname, the matched route, the stage, and the path and stage variables the
 * route produced. Those differences are gathered here, so the event builder
 * asks the endpoint rather than knowing about either service.
 */
export interface SimPayload2Endpoint {
  /** The API id, which is the leading label of the endpoint hostname. */
  readonly apiId: string;
  /** The AWS-shaped hostname of the endpoint, not the local one served. */
  readonly domainName: string;
  /** The leading label of the endpoint hostname. */
  readonly domainPrefix: string;
  /** The route this request matched, such as `$default` or `GET /orders`. */
  readonly routeKey: string;
  /** The stage that served the request. */
  readonly stage: string;
  /** Values captured by a parameterised route path, if there are any. */
  readonly pathParameters?: Record<string, string> | undefined;
  /** The stage's variables, if it has any. */
  readonly stageVariables?: Record<string, string> | undefined;
}

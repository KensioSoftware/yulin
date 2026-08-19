/**
 * The endpoint identity a payload format 1.0 event describes.
 *
 * Everything here is what the REST API calls itself for one matched request:
 * the API, the stage that served it, the resource the path reached and the
 * values that path captured. Gathering them lets the event builder ask the
 * endpoint rather than know about the service.
 */
export interface SimPayload1Endpoint {
  /** The API id, which is the leading label of the endpoint hostname. */
  readonly apiId: string;
  /** The Account that owns the API. */
  readonly accountId: string;
  /** The AWS-shaped hostname of the endpoint, not the local one served. */
  readonly domainName: string;
  /** The stage that served the request. */
  readonly stage: string;
  /** The allocated id of the resource the request matched. */
  readonly resourceId: string;
  /** The resource path template, such as `/orders/{orderId}`. */
  readonly resourcePath: string;
  /** The method declared on that resource, which may be `ANY`. */
  readonly httpMethod: string;
  /** Values captured by the resource path, if it captured any. */
  readonly pathParameters?: Readonly<Record<string, string>> | undefined;
  /** The stage's variables, if it has any. */
  readonly stageVariables?: Readonly<Record<string, string>> | undefined;
}

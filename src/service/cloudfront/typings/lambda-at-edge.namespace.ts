/**
 * The event and result shapes a Lambda@Edge handler works with.
 *
 * These are hand written for the same reason the CloudFront Functions shapes
 * are. The event is not part of any AWS SDK client package, and the simulator
 * refuses to take a typings dependency to name four objects. They are
 * structurally compatible with the `CloudFrontRequestEvent` and
 * `CloudFrontResponseEvent` types in `@types/aws-lambda`, so a handler already
 * written against those can be passed to the simulator unchanged.
 *
 * Two details differ from the CloudFront Functions shapes and catch people out.
 * A header is a list of `{ key, value }` pairs under its lowercase name rather
 * than a single value, and a status is a string rather than a number.
 */
export declare namespace LambdaAtEdge {
  export interface Header {
    /** The header name with the casing the viewer or the origin sent. */
    key?: string;
    value: string;
  }

  /**
   * Headers keyed by lowercase name, each holding every value sent under it.
   */
  export type Headers = Record<string, Header[]>;

  /**
   * The request body, present on a viewer-request event whose association
   * sets `IncludeBody`.
   */
  export interface Body {
    inputTruncated: boolean;
    action: "read-only" | "replace";
    encoding: "base64" | "text";
    data: string;
  }

  export interface Request {
    clientIp: string;
    method: string;
    uri: string;
    /** The query string without its leading `?`, empty when there is none. */
    querystring: string;
    headers: Headers;
    body?: Body;
  }

  export interface Response {
    /** The HTTP status as a string, which is how CloudFront presents it. */
    status: string;
    statusDescription?: string;
    headers?: Headers;
    body?: string;
    bodyEncoding?: "text" | "base64";
  }

  export type EventType = "viewer-request" | "viewer-response";

  export interface Config {
    distributionDomainName: string;
    distributionId: string;
    eventType: EventType;
    requestId: string;
  }

  export interface RequestRecord {
    cf: {
      config: Config & { eventType: "viewer-request" };
      request: Request;
    };
  }

  export interface ResponseRecord {
    cf: {
      config: Config & { eventType: "viewer-response" };
      request: Request;
      response: Response;
    };
  }

  export interface RequestEvent {
    Records: [RequestRecord];
  }

  export interface ResponseEvent {
    Records: [ResponseRecord];
  }

  export type Event = RequestEvent | ResponseEvent;

  /**
   * What a viewer-request handler answers with.
   *
   * Returning the request carries on to the origin with whatever the handler
   * changed. Returning a response answers the viewer there and then.
   */
  export type RequestResult = Request | Response;
}

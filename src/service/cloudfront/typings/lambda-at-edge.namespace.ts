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
    /**
     * The Origin the request is on its way to, present at an origin event and
     * absent at a viewer event.
     */
    origin?: Origin;
  }

  /**
   * A custom Origin as an origin event presents it.
   */
  export interface CustomOrigin {
    /** The Origin's own headers, keyed by lowercase name. */
    customHeaders: Headers;
    domainName: string;
    keepaliveTimeout: number;
    /** The Origin path, which goes in front of `request.uri`. */
    path: string;
    port: number;
    protocol: "http" | "https";
    readTimeout: number;
    sslProtocols: string[];
  }

  /**
   * An S3 Origin as an origin event presents it.
   */
  export interface S3Origin {
    /** Whether CloudFront signs what it reads from the Bucket. */
    authMethod: "origin-access-identity" | "none";
    customHeaders: Headers;
    domainName: string;
    /** The Origin path, which goes in front of the object key. */
    path: string;
    region: string;
  }

  /**
   * The Origin a request is on its way to, one kind or the other.
   */
  export interface Origin {
    custom?: CustomOrigin;
    s3?: S3Origin;
  }

  /**
   * A request at an origin event, which always carries the Origin.
   */
  export interface OriginRequest extends Request {
    origin: Origin;
  }

  export interface Response {
    /** The HTTP status as a string, which is how CloudFront presents it. */
    status: string;
    statusDescription?: string;
    headers?: Headers;
    body?: string;
    bodyEncoding?: "text" | "base64";
  }

  export type EventType =
    | "viewer-request"
    | "viewer-response"
    | "origin-request"
    | "origin-response";

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

  export interface OriginRequestRecord {
    cf: {
      config: Config & { eventType: "origin-request" };
      request: OriginRequest;
    };
  }

  export interface OriginResponseRecord {
    cf: {
      config: Config & { eventType: "origin-response" };
      request: OriginRequest;
      response: Response;
    };
  }

  export interface RequestEvent {
    Records: [RequestRecord];
  }

  export interface ResponseEvent {
    Records: [ResponseRecord];
  }

  export interface OriginRequestEvent {
    Records: [OriginRequestRecord];
  }

  export interface OriginResponseEvent {
    Records: [OriginResponseRecord];
  }

  export type Event =
    | RequestEvent
    | ResponseEvent
    | OriginRequestEvent
    | OriginResponseEvent;

  /**
   * What a request handler answers with, at the viewer or at the Origin.
   *
   * Returning the request carries on to the origin with whatever the handler
   * changed. Returning a response answers the viewer there and then.
   */
  export type RequestResult = Request | Response;
}

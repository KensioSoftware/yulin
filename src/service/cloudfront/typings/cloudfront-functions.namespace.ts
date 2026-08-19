export declare namespace CloudFrontFunction {
  export interface Value {
    value: string;
  }

  export interface MultiValue {
    value: string;
    multiValue: Value[];
  }

  export type Headers = Record<string, Value | MultiValue>;

  export type QueryString = Record<string, Value | MultiValue>;

  export type Cookies = Record<string, Value>;

  export interface Request {
    method: string;
    uri: string;
    headers: Headers;
    querystring: QueryString;
    cookies: Cookies;
  }

  export interface Response {
    statusCode: number;
    statusDescription?: string;
    headers: Headers;
    body?: string;
    bodyEncoding?: "text" | "base64";
  }

  export type EventType = "viewer-request" | "viewer-response";

  export interface EventContext {
    distributionDomainName?: string;
    endpoint?: string;
    distributionId?: string;
    eventType: EventType;
    requestId: string;
  }

  export interface Viewer {
    ip: string;
  }

  interface BaseEvent {
    context: EventContext;
    viewer: Viewer;
    request: Request;
  }

  export interface ViewerRequestEvent extends BaseEvent {
    context: EventContext & {
      eventType: "viewer-request";
    };
  }

  export interface ViewerResponseEvent extends BaseEvent {
    context: EventContext & {
      eventType: "viewer-response";
    };
    response: Response;
  }

  export type Event = ViewerRequestEvent | ViewerResponseEvent;

  /**
   * A handler may be async, because a key value store read is awaited.
   *
   * Runtime 2.0 supports `async` and `await`, and `cf.kvs().get()` returns a
   * promise, so a Function that reads a store has to be async. One that reads
   * nothing stays synchronous, and both are accepted here.
   */
  export type ViewerRequestHandler = (
    event: ViewerRequestEvent,
  ) => Request | Response | Promise<Request | Response>;

  export type ViewerResponseHandler = (
    event: ViewerResponseEvent,
  ) => Response | Promise<Response>;

  export type Handler = ViewerRequestHandler | ViewerResponseHandler;
}

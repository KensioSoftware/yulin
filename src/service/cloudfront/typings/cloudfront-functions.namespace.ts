export declare namespace CloudFrontFunction {
  export interface Value {
    value: string;
  }

  export interface MultiValue {
    multiValue: Value[];
  }

  export type Headers = Record<string, Value>;

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
    headers?: Headers;
  }

  export interface EventContext {
    distributionDomainName?: string;
    endpoint?: string;
    distributionId?: string;
    eventType: "viewer-request" | "viewer-response";
    requestId: string;
  }

  export interface Viewer {
    ip: string;
  }

  export interface Event {
    context: EventContext;
    viewer: Viewer;
    request: Request;
  }
}

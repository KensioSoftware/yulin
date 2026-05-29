export interface CloudFrontValue {
  value: string;
}

export interface CloudFrontMultiValue {
  multiValue: CloudFrontValue[];
}

export type CloudFrontHeaders = Record<string, CloudFrontValue>;

export type CloudFrontQueryString = Record<
  string,
  CloudFrontValue | CloudFrontMultiValue
>;

export type CloudFrontCookies = Record<string, CloudFrontValue>;

export interface CloudFrontRequest {
  method: string;
  uri: string;
  headers: CloudFrontHeaders;
  querystring: CloudFrontQueryString;
  cookies: CloudFrontCookies;
}

export interface CloudFrontResponse {
  statusCode: number;
  statusDescription?: string;
  headers?: CloudFrontHeaders;
}

export interface CloudFrontEventContext {
  distributionDomainName?: string;
  endpoint?: string;
  distributionId?: string;
  eventType: "viewer-request" | "viewer-response";
  requestId: string;
}

export interface CloudFrontViewer {
  ip: string;
}

export interface CloudFrontEvent {
  context: CloudFrontEventContext;
  viewer: CloudFrontViewer;
  request: CloudFrontRequest;
}

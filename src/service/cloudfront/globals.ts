/**
 * Optional global types for CloudFront Functions code.
 * This is helpful because CloudFront Function JS2 syntax does not support
 * imports, so global types provide useful type information.
 */

import type { CloudFrontFunction as CloudFrontFunctionType } from "./typings/cloudfront-functions.namespace.js";

declare global {
  namespace CloudFrontFunction {
    type Value = CloudFrontFunctionType.Value;
    type MultiValue = CloudFrontFunctionType.MultiValue;
    type Headers = CloudFrontFunctionType.Headers;
    type QueryString = CloudFrontFunctionType.QueryString;
    type Cookies = CloudFrontFunctionType.Cookies;
    type Request = CloudFrontFunctionType.Request;
    type Response = CloudFrontFunctionType.Response;
    type EventContext = CloudFrontFunctionType.EventContext;
    type Viewer = CloudFrontFunctionType.Viewer;
    type Event = CloudFrontFunctionType.Event;
  }
}

export {};

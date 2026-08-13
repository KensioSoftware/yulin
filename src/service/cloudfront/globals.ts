/**
 * Optional global types for CloudFront Functions code.
 * This is helpful because CloudFront Function JS2 syntax does not support
 * imports, so global types provide useful type information.
 */

import type { CffCloudFrontModule } from "./cff/kvs/cff-cloudfront-module.js";
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
    type ViewerRequestEvent = CloudFrontFunctionType.ViewerRequestEvent;
    type ViewerResponseEvent = CloudFrontFunctionType.ViewerResponseEvent;
  }

  /**
   * The `cf` helpers a CloudFront Function reaches a key value store through.
   *
   * Source code gets this from `import cf from "cloudfront"`, which is the one
   * import JS2 has. A Function written as a function reference for a test has
   * no import to write, so it reads `cf` as a global, and this is what gives
   * that global a type.
   */
  const cf: CffCloudFrontModule;
}

export {};

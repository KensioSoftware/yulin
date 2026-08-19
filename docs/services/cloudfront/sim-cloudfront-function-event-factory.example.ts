/**
 * Making a CloudFront Functions event to call a handler with.
 */

import { VariantFactory } from "@kensio/part-factory";

import {
  cloudFrontViewerResponseEventFactory,
  type CloudFrontFunction,
} from "@kensio/yulin/cloudfront";

function securityHeadersHandler(
  event: CloudFrontFunction.ViewerResponseEvent,
): CloudFrontFunction.Response {
  const response = event.response;
  const contentType = response.headers["content-type"]?.value ?? "";

  if (contentType.startsWith("text/html")) {
    response.headers["x-frame-options"] = { value: "DENY" };
  }

  return response;
}

// A response carrying a page. Those are the ones the policy is about.
const documentResponseFactory = new VariantFactory(
  cloudFrontViewerResponseEventFactory,
  {
    response: {
      headers: { "content-type": { value: "text/html; charset=utf-8" } },
    },
  },
);

const page = securityHeadersHandler(documentResponseFactory.make());

// DENY
console.log(page.headers["x-frame-options"]?.value);

// One response, for a test about a single asset. Everything else about it, down
// to the request that asked for it, is filled in as a served response's is.
const asset = securityHeadersHandler(
  cloudFrontViewerResponseEventFactory.make({
    response: { headers: { "content-type": { value: "text/css" } } },
  }),
);

// undefined
console.log(asset.headers["x-frame-options"]?.value);

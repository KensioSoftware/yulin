import { describe, it } from "vitest";
import {
  cloudFrontViewerRequestEventFactory,
  cloudFrontViewerResponseEventFactory,
} from "./cloudfront-functions.factory.js";
import { assertObjectMatches } from "@kensio/smartass";

describe("CloudFront Functions object factories", () => {
  it("makes a valid CloudFront Functions viewer-request object", () => {
    const cffRequest = cloudFrontViewerRequestEventFactory.make();
    assertObjectMatches(cffRequest, {
      context: { eventType: "viewer-request" },
      request: { headers: { host: { value: "yulin.test" } } },
    });
  });

  it("makes a valid CloudFront Functions viewer-response object", () => {
    const cffRequest = cloudFrontViewerResponseEventFactory.make({
      response: { statusCode: 200 },
    });
    assertObjectMatches(cffRequest, {
      context: { eventType: "viewer-response" },
      request: { headers: { host: { value: "yulin.test" } } },
      response: { statusCode: 200 },
    });
  });
});

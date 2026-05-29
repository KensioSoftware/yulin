import { describe, it } from "vitest";
import { cloudFrontViewerRequestEventFactory } from "./cloudfront-functions.factory.js";
import { assertObjectMatches } from "@kensio/smartass";

describe("CloudFront Functions object factories", () => {
  it("makes a valid CloudFront Functions request object", () => {
    const cffReq = cloudFrontViewerRequestEventFactory.make();
    assertObjectMatches(cffReq, {
      context: { eventType: "viewer-request" },
      request: { headers: { host: { value: "yulin.test" } } },
    });
  });
});

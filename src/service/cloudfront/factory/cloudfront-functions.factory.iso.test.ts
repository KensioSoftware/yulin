import { describe, it } from "vitest";
import { cloudFrontRequestFactory } from "./cloudfront-functions.factory.js";
import { assertObjectMatches } from "@kensio/smartass";

describe("CloudFront Functions object factories", () => {
  it("makes a valid CloudFront Functions request object", () => {
    const cffReq = cloudFrontRequestFactory.make();
    assertObjectMatches(cffReq, { headers: { host: { value: "yulin.test" } } });
  });
});

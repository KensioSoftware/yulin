import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { bucketNameFromCloudFrontS3OriginDomainName } from "./sim-cloudfront-s3-origin.js";

describe("sim CloudFront S3 Origin", () => {
  it("resolves bucket name fallback from non-S3 origin domain name", () => {
    assertIdentical(
      bucketNameFromCloudFrontS3OriginDomainName("example.test"),
      "example.test",
    );
  });

  it("throws on bad S3 Origin domain name", () => {
    const error = assertThrowsError(() => {
      bucketNameFromCloudFrontS3OriginDomainName(".s3.amazonaws.com");
    });

    assertInstanceOf(error, Error);
    assertStringIncludes(
      error.message,
      "Unable to resolve S3 bucket name from CloudFront origin domain name: .s3.amazonaws.com",
    );
  });
});

import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimS3Bucket } from "../../../s3/bucket/sim-s3-bucket.js";
import {
  SimS3Object,
  SimS3ObjectMetadata,
} from "../../../s3/object/s3-object.js";
import { simCloudFrontBehaviorFactory } from "../../behaviour/sim-cloud-front-behavior.js";
import { SimCloudFrontDistribution } from "../../distribution/sim-cloudfront-distribution.js";
import { bucketNameFromCfS3OriginDomainName } from "./sim-cf-s3-origin-bucket-name.js";
import { SimCloudFrontS3Origin } from "./sim-cloudfront-s3-origin.js";

describe("sim CloudFront S3 Origin", () => {
  async function originWithObject(
    metadata: Record<string, string>,
  ): Promise<SimCloudFrontS3Origin> {
    const bucket = new SimS3Bucket({ bucketName: "site-bucket" });

    await bucket.putObject(
      new SimS3Object({
        key: "data/standard.keys",
        body: Buffer.from("compressed"),
        metadata: new SimS3ObjectMetadata(metadata),
      }),
    );

    return new SimCloudFrontS3Origin({ bucket });
  }

  function originRequest(request: Request): {
    distribution: SimCloudFrontDistribution;
    behavior: ReturnType<typeof simCloudFrontBehaviorFactory.make>;
    req: Request;
  } {
    return {
      distribution: new SimCloudFrontDistribution(),
      behavior: simCloudFrontBehaviorFactory.make(),
      req: request,
    };
  }

  it("serves the system metadata an Object was stored with", async () => {
    // Given an Object stored as brotli with its own cache directive.
    const origin = await originWithObject({
      "content-type": "text/plain",
      "content-encoding": "br",
      "cache-control": "public, max-age=60",
    });

    // When CloudFront fetches it from the Origin.
    const response = await origin.fetch(
      originRequest(new Request("http://example.test/data/standard.keys")),
    );

    // Then the headers describing the stored bytes come back with them.
    assertIdentical(response.headers.get("content-type"), "text/plain");
    assertIdentical(response.headers.get("content-encoding"), "br");
    assertIdentical(
      response.headers.get("cache-control"),
      "public, max-age=60",
    );
    assertIdentical(response.headers.get("content-length"), "10");
  });

  it("serves the same headers for a HEAD request, without the body", async () => {
    // Given an Object stored as brotli.
    const origin = await originWithObject({ "content-encoding": "br" });

    // When CloudFront makes a HEAD request for it.
    const response = await origin.fetch(
      originRequest(
        new Request("http://example.test/data/standard.keys", {
          method: "HEAD",
        }),
      ),
    );

    // Then a caller learns what a GET would give them, body aside.
    assertIdentical(response.headers.get("content-encoding"), "br");
    assertIdentical(response.headers.get("content-length"), "10");
    assertIdentical(await response.text(), "");
  });

  it("resolves bucket name fallback from non-S3 origin domain name", () => {
    assertIdentical(
      bucketNameFromCfS3OriginDomainName("example.test"),
      "example.test",
    );
  });

  it("throws on bad S3 Origin domain name", () => {
    const error = assertThrowsError(() => {
      bucketNameFromCfS3OriginDomainName(".s3.amazonaws.com");
    });

    assertInstanceOf(error, Error);
    assertStringIncludes(
      error.message,
      "Unable to resolve S3 bucket name from CloudFront origin domain name: .s3.amazonaws.com",
    );
  });
});

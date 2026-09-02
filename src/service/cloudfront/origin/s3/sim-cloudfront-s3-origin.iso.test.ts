import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsError,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { grantPublicObjectRead } from "../../../s3/bucket/sim-s3-public-read.fixture.js";
import { SimS3NoSuchBucket } from "../../../s3/error/sim-s3.error.js";
import {
  SimS3Object,
  SimS3ObjectMetadata,
} from "../../../s3/object/s3-object.js";
import { simCloudFrontBehaviorFactory } from "../../behaviour/sim-cloud-front-behavior.js";
import { SimCloudFrontOriginAccessControl } from "../../origin-access-control/sim-cf-origin-access-control.js";
import { SimCloudFrontDistribution } from "../../distribution/sim-cloudfront-distribution.js";
import { bucketNameFromCfS3OriginDomainName } from "./sim-cf-s3-origin-bucket-name.js";
import { SimCloudFrontS3Origin } from "./sim-cloudfront-s3-origin.js";

describe("sim CloudFront S3 Origin", () => {
  async function originWithObject(
    metadata: Record<string, string>,
  ): Promise<SimCloudFrontS3Origin> {
    const simS3 = new SimAws().s3();

    await simS3.createBucket({ input: { Bucket: "site-bucket" } });
    await grantPublicObjectRead(simS3, "site-bucket");

    const bucket = simS3.getSimBucketByName("site-bucket");
    assertNonNullable(bucket);

    // Stored straight into the Bucket so the test states the system metadata
    // it is about, rather than the PutObject inputs that would set it.
    await bucket.putObject(
      new SimS3Object({
        key: "data/standard.keys",
        body: Buffer.from("compressed"),
        metadata: new SimS3ObjectMetadata(metadata),
      }),
    );

    return new SimCloudFrontS3Origin({ originBucket: { bucket, simS3 } });
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

  it("serves the metadata a caller attached to an Object", async () => {
    // Given an Object stored as CSV whose write also attached keys of its own,
    // one named after a header S3 sets itself.
    const origin = await originWithObject({
      "content-type": "text/csv",
      "x-amz-meta-author": "ada",
      "x-amz-meta-content-type": "application/vnd.internal",
    });

    // When CloudFront fetches it from the Origin.
    const response = await origin.fetch(
      originRequest(new Request("http://example.test/data/standard.keys")),
    );

    // Then the Origin serves each entry under its prefix, so a Distribution
    // sees the same Object an SDK read of the Bucket would.
    assertIdentical(response.headers.get("x-amz-meta-author"), "ada");
    assertIdentical(
      response.headers.get("x-amz-meta-content-type"),
      "application/vnd.internal",
    );
    assertIdentical(response.headers.get("content-type"), "text/csv");
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

  it("raises a Bucket that has gone rather than answering for it", async () => {
    // Given an Origin whose Bucket has since been deleted, which is neither an
    // Object the Distribution can serve nor one it can report on.
    const simS3 = new SimAws().s3();
    await simS3.createBucket({ input: { Bucket: "deleted-bucket" } });

    const bucket = simS3.getSimBucketByName("deleted-bucket");
    assertNonNullable(bucket);

    const origin = new SimCloudFrontS3Origin({
      originBucket: { bucket, simS3 },
    });
    await simS3.deleteBucket({ input: { Bucket: "deleted-bucket" } });

    // When CloudFront fetches from it.
    const error = await assertThrowsErrorAsync(async () => {
      await origin.fetch(
        originRequest(new Request("http://example.test/index.html")),
      );
    });

    // Then the failure reaches the caller instead of becoming a 404.
    assertInstanceOf(error, SimS3NoSuchBucket);
  });

  it("tells an origin event that the Bucket read is signed", async () => {
    // Given an Origin whose origin access control signs what it reads.
    const simS3 = new SimAws().s3();
    await simS3.createBucket({ input: { Bucket: "private-bucket" } });

    const bucket = simS3.getSimBucketByName("private-bucket");
    assertNonNullable(bucket);

    const origin = new SimCloudFrontS3Origin({
      originBucket: { bucket, simS3 },
      domainName: "private-bucket.s3.amazonaws.com",
      originAccessControl: new SimCloudFrontOriginAccessControl({
        name: "site-oac",
        originType: "s3",
        signingBehavior: "always",
      }),
    });

    // When an origin event asks what the Origin is.
    const { s3 } = origin.toEdgeOrigin();

    // Then the handler is told the read is signed, in CloudFront's own terms
    // for it.
    assertNonNullable(s3);
    assertIdentical(s3.authMethod, "origin-access-identity");
    assertIdentical(s3.domainName, "private-bucket.s3.amazonaws.com");
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

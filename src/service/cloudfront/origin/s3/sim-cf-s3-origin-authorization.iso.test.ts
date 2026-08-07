import {
  CreateBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  PutPublicAccessBlockCommand,
} from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertResponseStatus,
  assertStringIncludes,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simCfSiteDistributionConfig,
  simCfSiteDistributionId,
  simCfSiteRequest,
} from "../../../../../test/cloudfront/site-fixture.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { grantPublicObjectRead } from "../../../s3/bucket/sim-s3-public-read.fixture.js";
import type { SimS3 } from "../../../s3/sim-s3.js";

/**
 * Authorization on a CloudFront S3 Origin.
 *
 * An Origin with no origin access control reads the Bucket the way real
 * CloudFront reads the S3 REST endpoint without one, as an unsigned request, so
 * only the Bucket policy can make an Object servable. Getting this wrong in the
 * simulator is the expensive direction: a distribution that serves a private
 * Bucket in a test and 403s on deploy is the most common S3 Origin mistake, and
 * one the simulator could not reproduce before.
 */
describe("Simulated CloudFront S3 Origin authorization", () => {
  const sitePages: Readonly<Record<string, string>> = {
    "index.html": "<h1>Home</h1>",
    "404.html": "<h1>Not found</h1>",
  };

  /**
   * A site Bucket that nothing has made readable, which is what a Bucket
   * created without a policy is.
   */
  const privateSiteBucket = async (
    simS3: SimS3,
    bucketName: string,
  ): Promise<void> => {
    await simS3.createBucket(new CreateBucketCommand({ Bucket: bucketName }));

    await Promise.all(
      Object.entries(sitePages).map(
        async ([key, body]) =>
          await simS3.putObject(
            new PutObjectCommand({
              Bucket: bucketName,
              Key: key,
              ContentType: "text/html",
              Body: body,
            }),
          ),
      ),
    );
  };

  const distributionOver = async (
    simAws: SimAws,
    bucketName: string,
  ): Promise<string> =>
    await simCfSiteDistributionId(
      simAws,
      simCfSiteDistributionConfig(bucketName),
    );

  it("refuses an Object no Bucket policy has made readable", async () => {
    // Given a Distribution over a Bucket with no Bucket policy at all.
    const simAws = new SimAws();
    await privateSiteBucket(simAws.s3(), "private-origin-bucket");
    const distributionId = await distributionOver(
      simAws,
      "private-origin-bucket",
    );

    // When a viewer asks for a page.
    const response = await simCfSiteRequest(
      simAws,
      distributionId,
      "/index.html",
    );

    // Then the Origin refuses the read, as real S3 refuses an unsigned one.
    assertResponseStatus(response, 403, await describeResponse(response));
    assertStringIncludes(await response.text(), "Access denied");
  });

  it("serves the Object once the Bucket policy grants anonymous read", async () => {
    // Given the same Bucket with a policy granting s3:GetObject to everyone.
    const simAws = new SimAws();
    await privateSiteBucket(simAws.s3(), "public-origin-bucket");
    await grantPublicObjectRead(simAws.s3(), "public-origin-bucket");
    const distributionId = await distributionOver(
      simAws,
      "public-origin-bucket",
    );

    // When a viewer asks for a page.
    const response = await simCfSiteRequest(
      simAws,
      distributionId,
      "/index.html",
    );

    // Then the Distribution serves it.
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), "<h1>Home</h1>");
  });

  it("refuses a HEAD request the same way it refuses a GET", async () => {
    // Given a Distribution over a Bucket with no Bucket policy.
    const simAws = new SimAws();
    await privateSiteBucket(simAws.s3(), "private-head-bucket");
    const distributionId = await distributionOver(
      simAws,
      "private-head-bucket",
    );

    // When a viewer sends HEAD rather than GET.
    const response = await simCfSiteRequest(
      simAws,
      distributionId,
      "/index.html",
      { method: "HEAD" },
    );

    // Then the same authorization applies.
    assertResponseStatus(response, 403, await describeResponse(response));
  });

  it("answers a denied read with the Distribution's 403 error page", async () => {
    // Given a Bucket whose policy makes only the error page readable.
    const simAws = new SimAws();
    const simS3 = simAws.s3();
    await privateSiteBucket(simS3, "error-page-origin-bucket");
    await simS3.putPublicAccessBlock(
      new PutPublicAccessBlockCommand({
        Bucket: "error-page-origin-bucket",
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          IgnorePublicAcls: true,
        },
      }),
    );
    await simS3.putBucketPolicy(
      new PutBucketPolicyCommand({
        Bucket: "error-page-origin-bucket",
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: "*",
            Action: "s3:GetObject",
            Resource: "arn:aws:s3:::error-page-origin-bucket/404.html",
          },
        }),
      }),
    );

    // And a Distribution rewriting 403 to that page, as a static site does.
    const distributionId = await simCfSiteDistributionId(
      simAws,
      simCfSiteDistributionConfig("error-page-origin-bucket", {
        CustomErrorResponses: {
          Quantity: 1,
          Items: [
            {
              ErrorCode: 403,
              ResponsePagePath: "/404.html",
              ResponseCode: "404",
            },
          ],
        },
      }),
    );

    // When a viewer asks for the page the policy does not cover.
    const response = await simCfSiteRequest(
      simAws,
      distributionId,
      "/index.html",
    );

    // Then the Origin's 403 becomes the Distribution's error page.
    assertResponseStatus(response, 404, await describeResponse(response));
    assertIdentical(await response.text(), "<h1>Not found</h1>");
  });
});

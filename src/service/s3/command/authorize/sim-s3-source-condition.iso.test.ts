import {
  CreateBucketCommand,
  GetObjectCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { assertInstanceOf, assertThrowsErrorAsync } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import type { SimS3 } from "../../sim-s3.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";

/**
 * The source condition keys a simulated service supplies with an S3 request.
 *
 * A Bucket policy granting a service principal is nearly always conditioned on
 * `aws:SourceArn`, because a service principal is shared by every resource of
 * that service. Supplying it is what tells one CloudFront Distribution, or one
 * Account's resources, from another.
 */
describe("Simulated S3 request source conditions", () => {
  const distributionArn =
    "arn:aws:cloudfront::111111111111:distribution/E1EXAMPLE";

  const cloudFrontCaller = {
    kind: "service",
    service: "cloudfront.amazonaws.com",
  } as const;

  /**
   * A Bucket holding one Object, with a policy granting CloudFront the read
   * under the given condition.
   */
  const bucketGranting = async (condition: unknown): Promise<SimS3> => {
    const simS3 = new SimAws().s3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "site" }));
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "site",
        Key: "index.html",
        Body: "<h1>Home</h1>",
      }),
    );
    await simS3.putBucketPolicy(
      new PutBucketPolicyCommand({
        Bucket: "site",
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "cloudfront.amazonaws.com" },
              Action: "s3:GetObject",
              Resource: "arn:aws:s3:::site/*",
              Condition: condition,
            },
          ],
        }),
      }),
    );

    return simS3;
  };

  const readAsCloudFront = async (
    simS3: SimS3,
    options: SimS3RequestOptions,
  ): Promise<unknown> =>
    await simS3.getObject(
      new GetObjectCommand({ Bucket: "site", Key: "index.html" }),
      options,
    );

  it("allows a read carrying the source ARN the policy names", async () => {
    // Given a grant conditioned on one Distribution's ARN.
    const simS3 = await bucketGranting({
      StringEquals: { "aws:SourceArn": distributionArn },
    });

    // When the read carries that ARN.
    // Then it is allowed, and nothing is thrown.
    await readAsCloudFront(simS3, {
      caller: cloudFrontCaller,
      sourceArn: distributionArn,
    });
  });

  it("matches the condition key however it is capitalised", async () => {
    // Given the same grant written the way CDK writes it.
    const simS3 = await bucketGranting({
      StringEquals: { "AWS:SourceArn": distributionArn },
    });

    // When the read carries the ARN.
    // Then the key name is matched case insensitively, as IAM matches it.
    await readAsCloudFront(simS3, {
      caller: cloudFrontCaller,
      sourceArn: distributionArn,
    });
  });

  it("refuses a read carrying a different source ARN", async () => {
    // Given a grant conditioned on one Distribution's ARN.
    const simS3 = await bucketGranting({
      StringEquals: { "aws:SourceArn": distributionArn },
    });

    // When the read comes from another Distribution.
    const error = await assertThrowsErrorAsync(async () => {
      await readAsCloudFront(simS3, {
        caller: cloudFrontCaller,
        sourceArn:
          "arn:aws:cloudfront::111111111111:distribution/E1OTHERONE1234",
      });
    });

    // Then the statement does not apply to it.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("refuses a read carrying no source at all", async () => {
    // Given the same grant.
    const simS3 = await bucketGranting({
      StringEquals: { "aws:SourceArn": distributionArn },
    });

    // When the read says nothing about where it came from.
    const error = await assertThrowsErrorAsync(async () => {
      await readAsCloudFront(simS3, { caller: cloudFrontCaller });
    });

    // Then the missing key fails the condition rather than matching an empty
    // string, which is the safe direction.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("matches a source Account condition the same way", async () => {
    // Given a grant conditioned on the Account owning the calling resource.
    const simS3 = await bucketGranting({
      StringEquals: { "aws:SourceAccount": "111111111111" },
    });

    // When the read carries that Account.
    // Then it is allowed.
    await readAsCloudFront(simS3, {
      caller: cloudFrontCaller,
      sourceAccount: "111111111111",
    });

    // And a read from another Account's resource is refused.
    const error = await assertThrowsErrorAsync(async () => {
      await readAsCloudFront(simS3, {
        caller: cloudFrontCaller,
        sourceAccount: "222222222222",
      });
    });

    assertInstanceOf(error, SimIamAccessDenied);
  });
});

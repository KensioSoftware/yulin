import {
  CreateBucketCommand,
  GetBucketPolicyCommand,
  PutBucketPolicyCommand,
  PutPublicAccessBlockCommand,
} from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertInstanceOf,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimS3AccessDenied } from "../../error/sim-s3.error.js";

describe("S3 PutBucketPolicy under Block Public Access", () => {
  const simAws = new SimAws();

  const publicPolicy = (bucketName: string): string =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: "*",
        Action: "s3:GetObject",
        Resource: `arn:aws:s3:::${bucketName}/*`,
      },
    });

  it("refuses a public Bucket policy on a Bucket at its defaults", async () => {
    // Given a new Bucket, which blocks public policies as real S3 does.
    const simS3 = simAws.s3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "blocked" }));

    // When a public Bucket policy is applied.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.putBucketPolicy(
        new PutBucketPolicyCommand({
          Bucket: "blocked",
          Policy: publicPolicy("blocked"),
        }),
      ),
    );

    // Then S3 refuses it, naming the setting responsible.
    assertInstanceOf(error, SimS3AccessDenied);
    assertIdentical(error.$metadata.httpStatusCode, 403);
    assertStringIncludes(error.message, "BlockPublicPolicy");

    // And nothing was stored.
    const readError = await assertThrowsErrorAsync(async () =>
      simS3.getBucketPolicy(new GetBucketPolicyCommand({ Bucket: "blocked" })),
    );
    assertStringIncludes(readError.message, "No Bucket policy");
  });

  it("accepts a public Bucket policy once BlockPublicPolicy is turned off", async () => {
    // Given a Bucket that has opted out of blocking public policies.
    const simS3 = simAws.s3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "opened" }));
    await simS3.putPublicAccessBlock(
      new PutPublicAccessBlockCommand({
        Bucket: "opened",
        PublicAccessBlockConfiguration: { BlockPublicPolicy: false },
      }),
    );

    // When the same public policy is applied.
    await simS3.putBucketPolicy(
      new PutBucketPolicyCommand({
        Bucket: "opened",
        Policy: publicPolicy("opened"),
      }),
    );

    // Then it is stored.
    const output = await simS3.getBucketPolicy(
      new GetBucketPolicyCommand({ Bucket: "opened" }),
    );
    assertObjectEquals(
      JSON.parse(output.Policy),
      JSON.parse(publicPolicy("opened")),
    );
  });

  it("accepts a non-public Bucket policy while blocking is on", async () => {
    // Given a Bucket at its blocked defaults.
    const simS3 = simAws.s3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "fixed" }));

    // When a policy granting a fixed principal is applied.
    await simS3.putBucketPolicy(
      new PutBucketPolicyCommand({
        Bucket: "fixed",
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: { AWS: "arn:aws:iam::222222222222:role/Reader" },
            Action: "s3:GetObject",
            Resource: "arn:aws:s3:::fixed/*",
          },
        }),
      }),
    );

    // Then Block Public Access has nothing to say about it.
    const output = await simS3.getBucketPolicy(
      new GetBucketPolicyCommand({ Bucket: "fixed" }),
    );
    assertStringIncludes(output.Policy, "222222222222");
  });

  it("accepts a wildcard Principal pinned to a fixed Account", async () => {
    // Given a Bucket at its blocked defaults.
    const simS3 = simAws.s3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "pinned" }));

    // When a wildcard Principal is constrained by a fixed condition value.
    await simS3.putBucketPolicy(
      new PutBucketPolicyCommand({
        Bucket: "pinned",
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: "*",
            Action: "s3:GetObject",
            Resource: "arn:aws:s3:::pinned/*",
            Condition: {
              StringEquals: { "aws:SourceAccount": "222222222222" },
            },
          },
        }),
      }),
    );

    // Then the policy is not public, so it is stored.
    const output = await simS3.getBucketPolicy(
      new GetBucketPolicyCommand({ Bucket: "pinned" }),
    );
    assertStringIncludes(output.Policy, "aws:SourceAccount");
  });

  it("leaves an existing public policy in place when blocking is turned back on", async () => {
    // Given a Bucket carrying a public policy applied while blocking was off.
    const simS3 = simAws.s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "grandfathered" }),
    );
    await simS3.putPublicAccessBlock(
      new PutPublicAccessBlockCommand({
        Bucket: "grandfathered",
        PublicAccessBlockConfiguration: { BlockPublicPolicy: false },
      }),
    );
    await simS3.putBucketPolicy(
      new PutBucketPolicyCommand({
        Bucket: "grandfathered",
        Policy: publicPolicy("grandfathered"),
      }),
    );

    // When blocking is turned back on.
    await simS3.putPublicAccessBlock(
      new PutPublicAccessBlockCommand({
        Bucket: "grandfathered",
        PublicAccessBlockConfiguration: { BlockPublicPolicy: true },
      }),
    );

    // Then the stored policy is untouched: the setting governs new policies
    // rather than removing existing ones, as AWS documents.
    const output = await simS3.getBucketPolicy(
      new GetBucketPolicyCommand({ Bucket: "grandfathered" }),
    );
    assertObjectEquals(
      JSON.parse(output.Policy),
      JSON.parse(publicPolicy("grandfathered")),
    );
  });
});

import { describe, it } from "vitest";
import {
  CreateDistributionCommand,
  GetDistributionCommand,
} from "@aws-sdk/client-cloudfront";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertOneOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimCloudFrontResourceNotFoundException } from "../../error/sim-cloudfront.error.js";
import { CreateBucketCommand } from "@aws-sdk/client-s3";

describe("CloudFront GetDistributionCommand", () => {
  it("gets a CloudFront Distribution", async () => {
    const simAws = new SimAws();

    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "foo-bucket" }));

    const simCloudFront = simAws.cloudFront();

    const createDistroOutput = await simCloudFront.createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: {
          CallerReference: "test-ref-1",
          DefaultRootObject: "index.html",
          Origins: {
            Items: [
              {
                Id: "origin1",
                DomainName: "foo-bucket.s3.amazonaws.com",
                S3OriginConfig: { OriginAccessIdentity: "" },
              },
            ],
            Quantity: 1,
          },
          DefaultCacheBehavior: {
            TargetOriginId: "origin1",
            ViewerProtocolPolicy: "redirect-to-https",
            AllowedMethods: {
              Items: ["GET", "HEAD"],
              Quantity: 2,
            },
          },
          Comment: "Test distribution",
          Enabled: true,
        },
      }),
    );

    assertNonNullable(createDistroOutput.Distribution?.Id);
    const distributionId = createDistroOutput.Distribution.Id;

    const getBeforeDeployment = await simCloudFront.getDistribution(
      new GetDistributionCommand({ Id: distributionId }),
    );
    assertOneOf(getBeforeDeployment.Distribution?.Status, [
      "Deploying",
      "Deployed",
    ]);

    // Wait for deployment to complete.
    await simAws.backgroundTasksComplete();

    // Get the distribution again.
    const getOutput = await simCloudFront.getDistribution(
      new GetDistributionCommand({ Id: distributionId }),
    );

    assertNonNullable(getOutput.Distribution?.Id);
    assertIdentical(getOutput.Distribution.Id, distributionId);
    assertNonNullable(getOutput.Distribution.ARN);
    assertNonNullable(getOutput.Distribution.Status);
    assertIdentical(getOutput.Distribution.Status, "Deployed");
    assertNonNullable(getOutput.Distribution.LastModifiedTime);
    assertNonNullable(getOutput.Distribution.DomainName);
    assertIdentical(
      getOutput.Distribution.DomainName,
      `${distributionId.toLowerCase()}.cloudfront.net`,
    );
  });

  it("throws on undefined Distribution ID", async () => {
    const simAws = new SimAws();

    const simCloudFront = simAws.cloudFront();

    await assertThrowsErrorAsync(async () =>
      simCloudFront.getDistribution(
        new GetDistributionCommand({ Id: undefined }),
      ),
    );
  });

  it("throws on getting non-existent CloudFront Distribution", async () => {
    const simAws = new SimAws();

    const simCloudFront = simAws.cloudFront();

    const error = await assertThrowsErrorAsync(async () =>
      simCloudFront.getDistribution(
        new GetDistributionCommand({ Id: "NonExistentDistribution" }),
      ),
    );
    assertInstanceOf(error, SimCloudFrontResourceNotFoundException);
  });
});

import {
  CreateDistributionCommand,
  GetDistributionCommand,
} from "@aws-sdk/client-cloudfront";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertObjectMatches,
  assertOneOf,
  assertStringIncludes,
  assertStringLength,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";

describe("CloudFront CreateDistributionCommand scoping", () => {
  it("creates new CloudFront Distribution", async () => {
    const simAws = new SimAws();

    const simCloudFront = simAws.account("555555555555").cloudFront();

    const distributionConfig = {
      CallerReference: "test-distribution",
      Comment: "Test Distribution",
      Enabled: true,
      Origins: {
        Quantity: 0,
        Items: [],
      },
      DefaultCacheBehavior: {
        TargetOriginId: "origin-a",
        ViewerProtocolPolicy: "allow-all" as const,
        TrustedSigners: {
          Enabled: false,
          Quantity: 0,
        },
        ForwardedValues: {
          QueryString: false,
          Cookies: {
            Forward: "none" as const,
          },
        },
        MinTTL: 0,
      },
    };

    const createDistributionOutput = await simCloudFront.createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: distributionConfig,
      }),
    );

    assertNonNullable(createDistributionOutput.Distribution);
    assertNonNullable(createDistributionOutput.Distribution.Id);

    const distributionId = createDistributionOutput.Distribution.Id;

    assertStringLength(distributionId, 14);
    assertIdentical(distributionId.at(0), "E");
    assertIdentical(
      createDistributionOutput.Distribution.ARN,
      `arn:aws:cloudfront::555555555555:distribution/${distributionId}`,
    );
    assertOneOf(createDistributionOutput.Distribution.Status, [
      "Deploying",
      "Deployed",
    ]);
    assertInstanceOf(
      createDistributionOutput.Distribution.LastModifiedTime,
      Date,
    );
    assertIdentical(
      createDistributionOutput.Distribution.InProgressInvalidationBatches,
      0,
    );
    assertIdentical(
      createDistributionOutput.Distribution.DomainName,
      `${distributionId.toLowerCase()}.cloudfront.net`,
    );
    assertObjectMatches(
      createDistributionOutput.Distribution.DistributionConfig,
      {
        CallerReference: distributionConfig.CallerReference,
        Comment: distributionConfig.Comment,
        Enabled: distributionConfig.Enabled,
        Origins: distributionConfig.Origins,
        DefaultCacheBehavior: distributionConfig.DefaultCacheBehavior,
      },
    );
    assertIdentical(
      createDistributionOutput.Location,
      `https://cloudfront.amazonaws.com/2020-05-31/distribution/${distributionId}`,
    );

    await simAws.backgroundTasksComplete();

    const getDistributionOutput = await simCloudFront.getDistribution(
      new GetDistributionCommand({ Id: distributionId }),
    );
    assertNonNullable(getDistributionOutput.Distribution);
    assertIdentical(getDistributionOutput.Distribution.Id, distributionId);
    assertIdentical(
      getDistributionOutput.Distribution.ARN,
      `arn:aws:cloudfront::555555555555:distribution/${distributionId}`,
    );
    assertOneOf(getDistributionOutput.Distribution.Status, [
      "Deploying",
      "Deployed",
    ]);
    assertInstanceOf(getDistributionOutput.Distribution.LastModifiedTime, Date);
    assertIdentical(
      getDistributionOutput.Distribution.InProgressInvalidationBatches,
      0,
    );
    assertIdentical(
      getDistributionOutput.Distribution.DomainName,
      `${distributionId.toLowerCase()}.cloudfront.net`,
    );
    assertObjectMatches(getDistributionOutput.Distribution.DistributionConfig, {
      CallerReference: distributionConfig.CallerReference,
      Comment: distributionConfig.Comment,
      Enabled: distributionConfig.Enabled,
      Origins: distributionConfig.Origins,
      DefaultCacheBehavior: distributionConfig.DefaultCacheBehavior,
    });
  });

  it("uses Account-global CloudFront state across Regions", () => {
    const simAws = new SimAws();

    const euWest1CloudFront = simAws
      .account("555555555555")
      .region("eu-west-1")
      .cloudFront();
    const euWest2CloudFront = simAws
      .account("555555555555")
      .region("eu-west-2")
      .cloudFront();

    assertIdentical(euWest1CloudFront, euWest2CloudFront);
  });

  it("creates Distribution ARN for selected Account", async () => {
    const simAws = new SimAws();

    const simCloudFront = simAws
      .account("666666666666")
      .region("ap-east-1")
      .cloudFront();

    const createDistributionOutput = await simCloudFront.createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: {
          CallerReference: "account-specific-distribution",
          Comment: "Account-specific Distribution",
          Enabled: true,
          Origins: {
            Quantity: 0,
            Items: [],
          },
          DefaultCacheBehavior: {
            TargetOriginId: "origin-a",
            ViewerProtocolPolicy: "allow-all",
            TrustedSigners: {
              Enabled: false,
              Quantity: 0,
            },
            ForwardedValues: {
              QueryString: false,
              Cookies: {
                Forward: "none",
              },
            },
            MinTTL: 0,
          },
        },
      }),
    );

    assertNonNullable(createDistributionOutput.Distribution);
    assertNonNullable(createDistributionOutput.Distribution.ARN);
    assertStringIncludes(
      createDistributionOutput.Distribution.ARN,
      "arn:aws:cloudfront::666666666666:distribution/",
    );
  });
});

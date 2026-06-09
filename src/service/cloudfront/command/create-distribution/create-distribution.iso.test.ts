import { CreateDistributionCommand } from "@aws-sdk/client-cloudfront";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertStringLength,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimCloudFrontS3Origin } from "../../origin/sim-cloudfront-s3-origin.js";
import { CreateBucketCommand } from "@aws-sdk/client-s3";
import type { SimCloudFrontDistributionId } from "../../distribution/sim-cloudfront-distribution.js";

describe("CloudFront CreateDistributionCommand", () => {
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
    assertIdentical(distributionId[0], "E");
    assertIdentical(
      createDistributionOutput.Distribution.ARN,
      `arn:aws:cloudfront::555555555555:distribution/${distributionId}`,
    );
    assertIdentical(createDistributionOutput.Distribution.Status, "Deployed");
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
    assertIdentical(
      createDistributionOutput.Distribution.DistributionConfig,
      distributionConfig,
    );
    assertIdentical(
      createDistributionOutput.Location,
      `https://cloudfront.amazonaws.com/2020-05-31/distribution/${distributionId}`,
    );
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

  it("configures aliases, S3 Origins, and cache Behaviors", async () => {
    const simAws = new SimAws();

    const account = simAws.account("555555555555");
    const simS3 = account.s3();
    const simCloudFront = account.cloudFront();

    await simS3.createBucket(
      new CreateBucketCommand({
        Bucket: "assets.example.com",
      }),
    );

    const createDistributionOutput = await simCloudFront.createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: {
          CallerReference: "configured-distribution",
          Comment: "Configured Distribution",
          Enabled: true,
          Aliases: {
            Quantity: 2,
            Items: ["cdn.example.com", "static.example.com"],
          },
          Origins: {
            Quantity: 1,
            Items: [
              {
                Id: "s3-assets",
                DomainName: "assets.example.com.s3.amazonaws.com",
                S3OriginConfig: {
                  OriginAccessIdentity: "",
                },
              },
            ],
          },
          DefaultCacheBehavior: {
            TargetOriginId: "s3-assets",
            ViewerProtocolPolicy: "redirect-to-https",
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
          CacheBehaviors: {
            Quantity: 1,
            Items: [
              {
                PathPattern: "/images/*",
                TargetOriginId: "s3-assets",
                ViewerProtocolPolicy: "https-only",
                AllowedMethods: {
                  Quantity: 3,
                  Items: ["GET", "HEAD", "OPTIONS"],
                  CachedMethods: {
                    Quantity: 2,
                    Items: ["GET", "HEAD"],
                  },
                },
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
            ],
          },
        },
      }),
    );

    assertNonNullable(createDistributionOutput.Distribution);
    assertNonNullable(createDistributionOutput.Distribution.Id);

    const distribution = simCloudFront
      .getDistributions()
      .get(
        createDistributionOutput.Distribution.Id as SimCloudFrontDistributionId,
      );

    assertNonNullable(distribution);

    assertIdentical(distribution.getAlternateDomainNames().size, 2);
    assertTrue(distribution.hasAlternateDomainName("cdn.example.com"));
    assertTrue(distribution.hasAlternateDomainName("static.example.com"));

    assertIdentical(distribution.getOrigins().size, 1);
    assertInstanceOf(
      distribution.getOrigin("s3-assets"),
      SimCloudFrontS3Origin,
    );

    assertArrayLength(distribution.behaviors, 2);

    const defaultBehavior = distribution.behaviors[0];

    assertNonNullable(defaultBehavior);
    assertUndefined(defaultBehavior.pathPattern);
    assertIdentical(defaultBehavior.targetOriginName, "s3-assets");
    assertIdentical(defaultBehavior.viewerProtocolPolicy, "redirect-to-https");
    assertArrayLength([...defaultBehavior.allowedMethods], 2);
    assertTrue(defaultBehavior.allowedMethods.has("GET"));
    assertTrue(defaultBehavior.allowedMethods.has("HEAD"));
    assertArrayLength([...defaultBehavior.cachedMethods], 2);
    assertTrue(defaultBehavior.cachedMethods.has("GET"));
    assertTrue(defaultBehavior.cachedMethods.has("HEAD"));

    const imageBehavior = distribution.behaviors[1];

    assertNonNullable(imageBehavior);
    assertIdentical(imageBehavior.pathPattern, "/images/*");
    assertIdentical(imageBehavior.targetOriginName, "s3-assets");
    assertIdentical(imageBehavior.viewerProtocolPolicy, "https-only");
    assertArrayLength([...imageBehavior.allowedMethods], 3);
    assertTrue(imageBehavior.allowedMethods.has("GET"));
    assertTrue(imageBehavior.allowedMethods.has("HEAD"));
    assertTrue(imageBehavior.allowedMethods.has("OPTIONS"));
    assertArrayLength([...imageBehavior.cachedMethods], 2);
    assertTrue(imageBehavior.cachedMethods.has("GET"));
    assertTrue(imageBehavior.cachedMethods.has("HEAD"));
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

  it("throws error for unknown Origin type", async () => {
    const simAws = new SimAws();

    const simCloudFront = simAws.cloudFront();

    const error = await assertThrowsErrorAsync(async () => {
      await simCloudFront.createDistribution(
        new CreateDistributionCommand({
          DistributionConfig: {
            CallerReference: "unknown-origin-type-distribution",
            Comment: "Unknown Origin type Distribution",
            Enabled: true,
            Origins: {
              Quantity: 1,
              Items: [
                {
                  Id: "unknown-type-origin",
                  DomainName: "api.example.com",
                  // @ts-expect-error: testing bad origin config
                  WeirdOriginConfig: {
                    Foobar: 123,
                  },
                },
              ],
            },
            DefaultCacheBehavior: {
              TargetOriginId: "unknown-type-origin",
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
    });

    assertStringIncludes(
      error.message,
      "Unsupported sim CloudFront Origin type for Origin unknown-type-origin",
    );
  });
});

import { CreateDistributionCommand } from "@aws-sdk/client-cloudfront";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertMapSize,
  assertNonNullable,
  assertSetSize,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimCloudFrontS3Origin } from "../../origin/s3/sim-cloudfront-s3-origin.js";
import { CreateBucketCommand } from "@aws-sdk/client-s3";
import type { SimCloudFrontDistributionId } from "../../distribution/sim-cloudfront-distribution.js";

describe("CloudFront CreateDistributionCommand origin", () => {
  it("configures aliases, S3 Origins, and cache Behaviors", async () => {
    const simAws = new SimAws();

    const account = simAws.account("555555555555");
    const simS3 = account.s3();
    const simCloudFront = account.cloudFront();

    await simS3.createBucket(
      new CreateBucketCommand({
        Bucket: "assets.example.test",
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
            Items: ["cdn.example.test", "static.example.test"],
          },
          Origins: {
            Quantity: 1,
            Items: [
              {
                Id: "s3-assets",
                DomainName: "assets.example.test.s3.amazonaws.com",
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

    assertSetSize(distribution.getAlternateDomainNames(), 2);
    assertTrue(distribution.hasAlternateDomainName("cdn.example.test"));
    assertTrue(distribution.hasAlternateDomainName("static.example.test"));

    assertMapSize(distribution.getOrigins(), 1);
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
    assertSetSize(defaultBehavior.allowedMethods, 2);
    assertTrue(defaultBehavior.allowedMethods.has("GET"));
    assertTrue(defaultBehavior.allowedMethods.has("HEAD"));
    assertSetSize(defaultBehavior.cachedMethods, 2);
    assertTrue(defaultBehavior.cachedMethods.has("GET"));
    assertTrue(defaultBehavior.cachedMethods.has("HEAD"));

    const imageBehavior = distribution.behaviors[1];

    assertNonNullable(imageBehavior);
    assertIdentical(imageBehavior.pathPattern, "/images/*");
    assertIdentical(imageBehavior.targetOriginName, "s3-assets");
    assertIdentical(imageBehavior.viewerProtocolPolicy, "https-only");
    assertSetSize(imageBehavior.allowedMethods, 3);
    assertTrue(imageBehavior.allowedMethods.has("GET"));
    assertTrue(imageBehavior.allowedMethods.has("HEAD"));
    assertTrue(imageBehavior.allowedMethods.has("OPTIONS"));
    assertSetSize(imageBehavior.cachedMethods, 2);
    assertTrue(imageBehavior.cachedMethods.has("GET"));
    assertTrue(imageBehavior.cachedMethods.has("HEAD"));
  });
});

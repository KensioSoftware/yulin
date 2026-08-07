/* oxlint-disable typescript/no-deprecated -- CloudFront's cache-behaviour
   ForwardedValues is deprecated in the AWS API, and simulating the API as
   it is means accepting the shapes callers still send. */
import {
  CreateDistributionCommand,
  type EventType,
} from "@aws-sdk/client-cloudfront";
import { assertStringIncludes, assertThrowsErrorAsync } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { CreateBucketCommand } from "@aws-sdk/client-s3";

describe("CloudFront CreateDistributionCommand Origins", () => {
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
                  DomainName: "api.example.test",
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

  it.each([["origin-request"], ["origin-response"]])(
    "throws on %s event type",
    async (eventType) => {
      const simAws = new SimAws();

      const account = simAws.account("555555555555");
      const simS3 = account.s3();
      const simCloudFront = account.cloudFront();

      await simS3.createBucket(
        new CreateBucketCommand({
          Bucket: "assets.example.test",
        }),
      );

      const error = await assertThrowsErrorAsync(async () =>
        simCloudFront.createDistribution(
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
                FunctionAssociations: {
                  Quantity: 1,
                  Items: [
                    {
                      FunctionARN:
                        "arn:aws:cloudfront:us-east-1:555555555555:function/foobar",
                      EventType: eventType as EventType,
                    },
                  ],
                },
              },
            },
          }),
        ),
      );

      assertStringIncludes(error.message, `${eventType} not implemented`);
    },
  );
});

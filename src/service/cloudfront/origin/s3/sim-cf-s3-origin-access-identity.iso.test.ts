import { CreateDistributionCommand } from "@aws-sdk/client-cloudfront";
import { CreateBucketCommand } from "@aws-sdk/client-s3";
import {
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { simCfSiteDistributionConfig } from "../../../../../test/cloudfront/site-fixture.js";
import { SimAws } from "../../../aws/sim-aws.js";

describe("Simulated CloudFront S3 Origin access identity", () => {
  it("refuses an Origin declaring a legacy origin access identity", async () => {
    // Given a Bucket an Origin could read.
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "oai-origin-bucket" }));

    // When a Distribution declares an origin access identity on that Origin.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFront().createDistribution(
        new CreateDistributionCommand({
          DistributionConfig: simCfSiteDistributionConfig("oai-origin-bucket", {
            Origins: {
              Quantity: 1,
              Items: [
                {
                  Id: "site-origin",
                  DomainName: "oai-origin-bucket.s3.amazonaws.com",
                  S3OriginConfig: {
                    OriginAccessIdentity:
                      "origin-access-identity/cloudfront/E127EXAMPLE51Z",
                  },
                },
              ],
            },
          }),
        }),
      );
    });

    // Then it is refused by name, rather than read as an anonymous request it
    // is not.
    assertStringIncludes(error.message, "S3OriginConfig.OriginAccessIdentity");
    assertStringIncludes(error.message, "origin access control");
  });

  it("accepts an Origin leaving the origin access identity empty", async () => {
    // Given the same Bucket and the empty OriginAccessIdentity CloudFront
    // itself writes for an Origin that signs nothing.
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "anonymous-bucket" }));

    // When the Distribution is created.
    const created = await simAws.cloudFront().createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: simCfSiteDistributionConfig("anonymous-bucket"),
      }),
    );

    // Then it is accepted.
    assertNonNullable(created.Distribution?.Id);
  });
});

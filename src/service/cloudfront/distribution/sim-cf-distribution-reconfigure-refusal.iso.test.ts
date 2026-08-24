import {
  assertArrayIncludes,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import {
  CreateDistributionCommand,
  UpdateDistributionCommand,
} from "@aws-sdk/client-cloudfront";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { SimCloudFrontInvalidResponseHeadersPolicyId } from "../error/sim-cloudfront.error.js";
import { SimCloudFrontResponseHeadersPolicy } from "../response-headers-policy/sim-cf-response-headers-policy.js";
import {
  simCfSiteBucket,
  simCfSiteDistributionConfig,
} from "../../../../test/cloudfront/site-fixture.js";

describe("Refusing a sim CloudFront Distribution update", () => {
  it("leaves the Distribution as it was when a Behavior names a missing policy", async () => {
    // Given a deployed Distribution serving under an alternate domain name.
    const simAws = new SimAws();

    await simCfSiteBucket(simAws, "update-refusal-bucket", {
      "index.html": "<h1>Home</h1>",
    });

    const policy = new SimCloudFrontResponseHeadersPolicy({
      name: "CacheHeaders",
    });

    simAws.cloudFront().addResponseHeadersPolicy(policy);

    const creation = await simAws.cloudFront().createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: simCfSiteDistributionConfig(
          "update-refusal-bucket",
          {
            Aliases: { Quantity: 1, Items: ["cdn.example.com"] },
            DefaultCacheBehavior: {
              TargetOriginId: "site-origin",
              ViewerProtocolPolicy: "allow-all",
              ResponseHeadersPolicyId: policy.id,
            },
          },
        ),
      }),
    );

    const distributionId = creation.Distribution?.Id;

    assertNonNullable(distributionId);

    const distribution = simAws
      .cloudFront()
      .getSimDistributionById(distributionId);

    assertNonNullable(distribution);

    // When an update names a response headers policy that does not exist.
    await assertThrowsErrorAsync(async () => {
      await simAws.cloudFront().updateDistribution(
        new UpdateDistributionCommand({
          Id: distributionId,
          DistributionConfig: simCfSiteDistributionConfig(
            "update-refusal-bucket",
            {
              Aliases: { Quantity: 1, Items: ["other.example.com"] },
              DefaultCacheBehavior: {
                TargetOriginId: "site-origin",
                ViewerProtocolPolicy: "allow-all",
                ResponseHeadersPolicyId: "11111111-2222-3333-4444-555555555555",
              },
            },
          ),
        }),
      );
    });

    // Then the Distribution still has the Behavior and the alternate domain
    // name it had before, rather than being left half replaced.
    assertArrayLength(distribution.behaviors, 1);
    assertIdentical(
      distribution.behaviors[0].responseHeadersPolicyId,
      policy.id,
    );
    assertArrayIncludes(
      [...distribution.getAlternateDomainNames()],
      "cdn.example.com",
    );
  });

  it("reports the refusal as InvalidResponseHeadersPolicyId", async () => {
    // Given a deployed Distribution.
    const simAws = new SimAws();

    await simCfSiteBucket(simAws, "update-refusal-error-bucket", {
      "index.html": "<h1>Home</h1>",
    });

    const creation = await simAws.cloudFront().createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: simCfSiteDistributionConfig(
          "update-refusal-error-bucket",
        ),
      }),
    );
    const distributionId = creation.Distribution?.Id;

    assertNonNullable(distributionId);

    // When an update names a policy nothing created, then the refusal names
    // the ID rather than being a generic failure.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFront().updateDistribution(
        new UpdateDistributionCommand({
          Id: distributionId,
          DistributionConfig: simCfSiteDistributionConfig(
            "update-refusal-error-bucket",
            {
              DefaultCacheBehavior: {
                TargetOriginId: "site-origin",
                ViewerProtocolPolicy: "allow-all",
                ResponseHeadersPolicyId: "11111111-2222-3333-4444-555555555555",
              },
            },
          ),
        }),
      );
    });

    assertInstanceOf(error, SimCloudFrontInvalidResponseHeadersPolicyId);
  });
});

import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import {
  CreateDistributionCommand,
  GetDistributionCommand,
  UpdateDistributionCommand,
} from "@aws-sdk/client-cloudfront";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { SimCloudFrontCachePolicy } from "../cache-policy/sim-cf-cache-policy.js";
import { simCfManagedCachePolicyIds } from "../cache-policy/sim-cf-managed-cache-policies.js";
import { SimCloudFrontNoSuchCachePolicy } from "../error/sim-cloudfront.error.js";
import {
  simCfSiteBucket,
  simCfSiteDistributionConfig,
} from "../../../../test/cloudfront/site-fixture.js";

const bucketName = "cache-policy-site-bucket";

/**
 * An ID that is neither a managed policy nor one created here, which is what a
 * policy ID from a real account looks like.
 */
const absentPolicyId = "11111111-2222-3333-4444-555555555555";

describe("A Cache Behavior's CachePolicyId", () => {
  async function simAwsWithSite(): Promise<SimAws> {
    const simAws = new SimAws();

    await simCfSiteBucket(simAws, bucketName, {
      "index.html": "<h1>Home</h1>",
    });

    return simAws;
  }

  it("is reported for a default Behavior given a managed policy", async () => {
    // Given a Distribution whose default Behavior names a managed policy, the
    // way CDK's CachePolicy.CACHING_OPTIMIZED synthesizes one.
    const simAws = await simAwsWithSite();
    const creation = await simAws.cloudFront().createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: simCfSiteDistributionConfig(bucketName, {
          DefaultCacheBehavior: {
            TargetOriginId: "site-origin",
            ViewerProtocolPolicy: "allow-all",
            CachePolicyId: simCfManagedCachePolicyIds.cachingOptimized,
          },
        }),
      }),
    );
    const distributionId = creation.Distribution?.Id;

    assertNonNullable(distributionId);

    // When the Distribution is read back.
    const read = await simAws
      .cloudFront()
      .getDistribution(new GetDistributionCommand({ Id: distributionId }));

    // Then GetDistribution reports the managed ID it was given.
    assertIdentical(
      read.Distribution?.DistributionConfig?.DefaultCacheBehavior
        ?.CachePolicyId,
      simCfManagedCachePolicyIds.cachingOptimized,
    );

    // And the Behavior itself records it, so two Behaviors keying on different
    // things no longer read identically.
    const distribution = simAws
      .cloudFront()
      .getSimDistributionById(distributionId);

    assertNonNullable(distribution);
    assertArrayLength(distribution.behaviors, 1);
    assertIdentical(
      distribution.behaviors[0].cachePolicyId,
      simCfManagedCachePolicyIds.cachingOptimized,
    );
  });

  it("is reported for a named Behavior given a policy of its own", async () => {
    // Given a policy this simulation holds and a Distribution with a path
    // Behavior naming it.
    const simAws = await simAwsWithSite();
    const policy = new SimCloudFrontCachePolicy({ name: "BeaconPolicy" });

    simAws.cloudFront().addCachePolicy(policy);

    const creation = await simAws.cloudFront().createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: simCfSiteDistributionConfig(bucketName, {
          CacheBehaviors: {
            Quantity: 1,
            Items: [
              {
                PathPattern: "/beacon",
                TargetOriginId: "site-origin",
                ViewerProtocolPolicy: "allow-all",
                CachePolicyId: policy.id,
              },
            ],
          },
        }),
      }),
    );
    const distributionId = creation.Distribution?.Id;

    assertNonNullable(distributionId);

    // When the Distribution is read back.
    const read = await simAws
      .cloudFront()
      .getDistribution(new GetDistributionCommand({ Id: distributionId }));

    // Then the path Behavior reports the policy, and the default Behavior
    // reports none.
    const config = read.Distribution?.DistributionConfig;

    assertNonNullable(config);
    assertIdentical(
      config.CacheBehaviors?.Items?.[0]?.CachePolicyId,
      policy.id,
    );
    assertUndefined(config.DefaultCacheBehavior?.CachePolicyId);
  });

  it("is reported after an update changes the policy", async () => {
    // Given a deployed Distribution keying its cache one way.
    const simAws = await simAwsWithSite();
    const creation = await simAws.cloudFront().createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: simCfSiteDistributionConfig(bucketName, {
          DefaultCacheBehavior: {
            TargetOriginId: "site-origin",
            ViewerProtocolPolicy: "allow-all",
            CachePolicyId: simCfManagedCachePolicyIds.cachingOptimized,
          },
        }),
      }),
    );
    const distributionId = creation.Distribution?.Id;

    assertNonNullable(distributionId);

    // When an update moves it onto another policy.
    const update = await simAws.cloudFront().updateDistribution(
      new UpdateDistributionCommand({
        Id: distributionId,
        DistributionConfig: simCfSiteDistributionConfig(bucketName, {
          DefaultCacheBehavior: {
            TargetOriginId: "site-origin",
            ViewerProtocolPolicy: "allow-all",
            CachePolicyId: simCfManagedCachePolicyIds.cachingDisabled,
          },
        }),
      }),
    );

    // Then the update answers with the new policy.
    assertIdentical(
      update.Distribution?.DistributionConfig?.DefaultCacheBehavior
        ?.CachePolicyId,
      simCfManagedCachePolicyIds.cachingDisabled,
    );

    const distribution = simAws
      .cloudFront()
      .getSimDistributionById(distributionId);

    assertNonNullable(distribution);
    assertIdentical(
      distribution.behaviors[0]?.cachePolicyId,
      simCfManagedCachePolicyIds.cachingDisabled,
    );
  });

  it("is refused where no policy and no managed ID answers to it", async () => {
    // Given a Distribution whose Behavior names a policy from a real account.
    const simAws = await simAwsWithSite();

    // When it is created.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFront().createDistribution(
        new CreateDistributionCommand({
          DistributionConfig: simCfSiteDistributionConfig(bucketName, {
            DefaultCacheBehavior: {
              TargetOriginId: "site-origin",
              ViewerProtocolPolicy: "allow-all",
              CachePolicyId: absentPolicyId,
            },
          }),
        }),
      );
    });

    // Then CloudFront refuses it by name, and the message says what a Behavior
    // may name.
    assertInstanceOf(error, SimCloudFrontNoSuchCachePolicy);
    assertStringIncludes(error.message, absentPolicyId);
  });

  it("leaves an update refused for it serving what it served before", async () => {
    // Given a deployed Distribution on a policy that is here.
    const simAws = await simAwsWithSite();
    const policy = new SimCloudFrontCachePolicy({ name: "BeaconPolicy" });

    simAws.cloudFront().addCachePolicy(policy);

    const creation = await simAws.cloudFront().createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: simCfSiteDistributionConfig(bucketName, {
          DefaultCacheBehavior: {
            TargetOriginId: "site-origin",
            ViewerProtocolPolicy: "allow-all",
            CachePolicyId: policy.id,
          },
        }),
      }),
    );
    const distributionId = creation.Distribution?.Id;

    assertNonNullable(distributionId);

    // When an update names a policy that is not there.
    await assertThrowsErrorAsync(async () => {
      await simAws.cloudFront().updateDistribution(
        new UpdateDistributionCommand({
          Id: distributionId,
          DistributionConfig: simCfSiteDistributionConfig(bucketName, {
            DefaultCacheBehavior: {
              TargetOriginId: "site-origin",
              ViewerProtocolPolicy: "allow-all",
              CachePolicyId: absentPolicyId,
            },
          }),
        }),
      );
    });

    // Then the Behavior still holds the policy it was created with.
    const distribution = simAws
      .cloudFront()
      .getSimDistributionById(distributionId);

    assertNonNullable(distribution);
    assertArrayLength(distribution.behaviors, 1);
    assertIdentical(distribution.behaviors[0].cachePolicyId, policy.id);
  });
});

import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../../cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { simCfManagedCachePolicyIds } from "../../cache-policy/sim-cf-managed-cache-policies.js";
import { SimCloudFrontDistribution } from "../../distribution/sim-cloudfront-distribution.js";

const bucketName = "held-cache-policy-bucket";

/**
 * An ID that is neither a managed policy nor one a template created here,
 * which is what a policy ID from a real account looks like.
 */
const absentPolicyId = "11111111-2222-3333-4444-555555555555";

/**
 * A template with a Distribution, with the Behaviors the test is about merged
 * over the default one.
 */
function siteTemplate(
  distributionConfig: SimCfnTemplateValueRecord = {},
): CfnTemplateBodyRecord {
  return {
    Resources: {
      SiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: { BucketName: bucketName },
      },
      SiteDistribution: {
        Type: "AWS::CloudFront::Distribution",
        DependsOn: ["SiteBucket"],
        Properties: {
          DistributionConfig: {
            DefaultRootObject: "index.html",
            Enabled: true,
            Origins: [
              {
                Id: "SiteOrigin",
                DomainName: `${bucketName}.s3.amazonaws.com`,
                S3OriginConfig: { OriginAccessIdentity: "" },
              },
            ],
            DefaultCacheBehavior: {
              TargetOriginId: "SiteOrigin",
              ViewerProtocolPolicy: "allow-all",
              CachePolicyId: absentPolicyId,
            },
            ...distributionConfig,
          },
        },
      },
    },
  };
}

describe("CloudFormation Distribution on an absent cache policy", () => {
  async function deployedSite(
    stackName: string,
    distributionConfig: SimCfnTemplateValueRecord = {},
  ): Promise<{
    distribution: SimCloudFrontDistribution;
    ignoredPaths: readonly string[];
    ignoredReasons: readonly string[];
  }> {
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName,
      template: siteTemplate(distributionConfig),
    });

    await stack.waitForDeployComplete();

    const resource = stack.getResource("SiteDistribution");

    assertNonNullable(resource);
    assertInstanceOf(resource.simResource, SimCloudFrontDistribution);

    return {
      distribution: resource.simResource,
      ignoredPaths: stack.ignoredProperties.map((ignored) => ignored.path),
      ignoredReasons: stack.ignoredProperties.map((ignored) => ignored.reason),
    };
  }

  it("deploys the Distribution and records the policy it dropped", async () => {
    // Given a template naming a cache policy from some real account.
    // When the stack is deployed.
    const { distribution, ignoredPaths, ignoredReasons } = await deployedSite(
      "dropped-cache-policy-stack",
    );

    // Then the Distribution is up, with no policy on the Behavior that named
    // one.
    assertArrayLength(distribution.behaviors, 1);
    assertUndefined(distribution.behaviors[0].cachePolicyId);

    // And the property is recorded under the Behavior that named it, so a test
    // that cares reads why.
    assertArrayLength(ignoredPaths, 1);
    assertIdentical(
      ignoredPaths[0],
      "DistributionConfig.DefaultCacheBehavior.CachePolicyId",
    );
    assertStringIncludes(ignoredReasons[0] ?? "", absentPolicyId);
  });

  it("keeps a managed policy the template named", async () => {
    // Given a Distribution whose path Behavior names a managed policy and
    // whose default Behavior names one from a real account.
    const { distribution, ignoredPaths } = await deployedSite(
      "managed-cache-policy-stack",
      {
        CacheBehaviors: [
          {
            PathPattern: "/beacon",
            TargetOriginId: "SiteOrigin",
            ViewerProtocolPolicy: "allow-all",
            CachePolicyId: simCfManagedCachePolicyIds.cachingDisabled,
          },
        ],
      },
    );

    // Then only the default Behavior lost its policy.
    assertArrayLength(ignoredPaths, 1);
    assertIdentical(
      ignoredPaths[0],
      "DistributionConfig.DefaultCacheBehavior.CachePolicyId",
    );

    // And the path Behavior holds the managed ID it named.
    assertIdentical(
      distribution.behaviors[1]?.cachePolicyId,
      simCfManagedCachePolicyIds.cachingDisabled,
    );
  });

  it("records both policies a Behavior loses, under their own paths", async () => {
    // Given a path Behavior naming a response headers policy and a cache
    // policy, neither of which is here.
    const { ignoredPaths } = await deployedSite("both-policies-stack", {
      CacheBehaviors: [
        {
          PathPattern: "/beacon",
          TargetOriginId: "SiteOrigin",
          ViewerProtocolPolicy: "allow-all",
          CachePolicyId: absentPolicyId,
          ResponseHeadersPolicyId: absentPolicyId,
        },
      ],
    });

    // Then each is recorded on its own, alongside the default Behavior's.
    assertArrayLength(ignoredPaths, 3);
    assertIdentical(
      ignoredPaths[1],
      "DistributionConfig.CacheBehaviors./beacon.ResponseHeadersPolicyId",
    );
    assertIdentical(
      ignoredPaths[2],
      "DistributionConfig.CacheBehaviors./beacon.CachePolicyId",
    );
  });
});

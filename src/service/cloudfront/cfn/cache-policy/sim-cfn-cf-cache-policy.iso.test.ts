import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsError,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../../cloudformation/template/sim-cfn-template.js";
import { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimCloudFrontCachePolicy } from "../../cache-policy/sim-cf-cache-policy.js";
import { SimCloudFrontDistribution } from "../../distribution/sim-cloudfront-distribution.js";
import { SimCfnCfCachePolicyConfig } from "./sim-cfn-cf-cache-policy-config.js";
import { SimCfnCfCachePolicyCreator } from "./sim-cfn-cf-cache-policy-creator.js";

const bucketName = "cache-policy-cfn-bucket";

/**
 * A template with a cache policy of its own, and a Distribution whose default
 * Behavior points at it with a Ref.
 */
function siteTemplate(
  cachePolicyConfig: SimCfnTemplateValueRecord = {},
): CfnTemplateBodyRecord {
  return {
    Resources: {
      SiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: { BucketName: bucketName },
      },
      BeaconPolicy: {
        Type: "AWS::CloudFront::CachePolicy",
        Properties: {
          CachePolicyConfig: {
            Name: "BeaconPolicy",
            MinTTL: 0,
            DefaultTTL: 0,
            MaxTTL: 0,
            ParametersInCacheKeyAndForwardedToOrigin: {
              EnableAcceptEncodingGzip: false,
              CookiesConfig: { CookieBehavior: "none" },
              HeadersConfig: { HeaderBehavior: "none" },
              QueryStringsConfig: { QueryStringBehavior: "none" },
            },
            ...cachePolicyConfig,
          },
        },
      },
      SiteDistribution: {
        Type: "AWS::CloudFront::Distribution",
        DependsOn: ["SiteBucket", "BeaconPolicy"],
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
              CachePolicyId: { Ref: "BeaconPolicy" },
            },
          },
        },
      },
    },
    Outputs: {
      PolicyRef: { Value: { Ref: "BeaconPolicy" } },
      PolicyId: { Value: { "Fn::GetAtt": ["BeaconPolicy", "Id"] } },
    },
  };
}

describe("AWS::CloudFront::CachePolicy", () => {
  it("creates a policy a Behavior can name", async () => {
    // Given a template declaring its own cache policy.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "cache-policy-stack",
      template: siteTemplate(),
    });

    await stack.waitForDeployComplete();

    // When the created policy is read back.
    const resource = stack.getResource("BeaconPolicy");

    assertNonNullable(resource);
    assertInstanceOf(resource.simResource, SimCloudFrontCachePolicy);

    const policy = resource.simResource;

    // Then the policy is held under its name, rather than the Resource being
    // skipped.
    assertIdentical(policy.name, "BeaconPolicy");
    assertIdentical(simAws.cloudFront().getCachePolicyById(policy.id), policy);

    // And the Behavior that Refs it reports its ID.
    const distributionResource = stack.getResource("SiteDistribution");

    assertNonNullable(distributionResource);
    assertInstanceOf(
      distributionResource.simResource,
      SimCloudFrontDistribution,
    );
    assertIdentical(
      distributionResource.simResource.behaviors[0]?.cachePolicyId,
      policy.id,
    );

    // And Ref and the Id attribute both answer with the policy ID.
    assertIdentical(stack.outputs.get("PolicyRef")?.value, policy.id);
    assertIdentical(stack.outputs.get("PolicyId")?.value, policy.id);
  });

  it("keeps the comment the template gave the policy", async () => {
    // Given a template whose policy carries a comment.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "cache-policy-comment-stack",
      template: siteTemplate({ Comment: "No query string in the key" }),
    });

    await stack.waitForDeployComplete();

    const resource = stack.getResource("BeaconPolicy");

    assertNonNullable(resource);
    assertInstanceOf(resource.simResource, SimCloudFrontCachePolicy);

    // Then the comment is what the template wrote.
    assertIdentical(resource.simResource.comment, "No query string in the key");
  });

  it("carries the TTLs and the cache key a deployed template wrote", async () => {
    // Given a template whose policy holds an object for an hour and keys on
    // one query string.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "cache-policy-key-stack",
      template: siteTemplate({
        MinTTL: 60,
        DefaultTTL: 3600,
        MaxTTL: 86_400,
        ParametersInCacheKeyAndForwardedToOrigin: {
          EnableAcceptEncodingGzip: true,
          CookiesConfig: { CookieBehavior: "none" },
          HeadersConfig: { HeaderBehavior: "none" },
          QueryStringsConfig: {
            QueryStringBehavior: "whitelist",
            QueryStrings: ["page"],
          },
        },
      }),
    });

    await stack.waitForDeployComplete();

    const resource = stack.getResource("BeaconPolicy");

    assertNonNullable(resource);
    assertInstanceOf(resource.simResource, SimCloudFrontCachePolicy);

    // Then the policy the Behavior names holds what the template configured.
    const policy = resource.simResource;

    assertIdentical(policy.minTtlSec, 60);
    assertIdentical(policy.defaultTtlSec, 3600);
    assertIdentical(policy.maxTtlSec, 86_400);
    assertIdentical(policy.cacheKey.queryStringBehavior, "whitelist");
    assertArrayEquals(policy.cacheKey.queryStrings, ["page"]);
    assertTrue(policy.cacheKey.enableAcceptEncodingGzip);
  });

  it("forgets the policy when the Stack is torn down", async () => {
    // Given a deployed Stack holding a policy.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "cache-policy-teardown-stack",
      template: siteTemplate(),
    });

    await stack.waitForDeployComplete();

    const resource = stack.getResource("BeaconPolicy");

    assertNonNullable(resource);
    assertInstanceOf(resource.simResource, SimCloudFrontCachePolicy);

    const policyId = resource.simResource.id;

    // When the Stack is deleted.
    await simAws
      .cloudFormation()
      .deleteStack({ input: { StackName: "cache-policy-teardown-stack" } });
    await simAws.backgroundTasksComplete();

    // Then nothing answers to the policy's ID.
    assertUndefined(simAws.cloudFront().getCachePolicyById(policyId));
  });

  it("refuses a Resource whose CachePolicyConfig is not an object", async () => {
    // Given a template whose policy config is a string.
    const simAws = new SimAws();

    // When it is deployed.
    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "cache-policy-invalid-stack",
        template: {
          Resources: {
            BeaconPolicy: {
              Type: "AWS::CloudFront::CachePolicy",
              Properties: { CachePolicyConfig: "BeaconPolicy" },
            },
          },
        },
      });

      await stack.waitForDeployComplete();
    });

    // Then the refusal names the Resource and the part that could not be read.
    assertStringIncludes(error.message, "BeaconPolicy");
    assertStringIncludes(error.message, "CachePolicyConfig must be an object");
  });

  it("refuses a Resource with no Name", () => {
    // Given a policy config that left its Name out.
    const config = new SimCfnCfCachePolicyConfig({
      resource: new SimCfnResource({ logicalId: "BeaconPolicy" }),
      properties: { CachePolicyConfig: { MinTTL: 0 } },
    });

    // When it is read.
    const error = assertThrowsError(() => config.build());

    // Then the refusal says which field is missing.
    assertStringIncludes(error.message, "needs a string Name");
  });

  it("has nothing to forget for a Resource that never created a policy", () => {
    // Given a Resource whose creation never ran, so it holds no policy.
    const simAws = new SimAws();
    const creator = new SimCfnCfCachePolicyCreator({
      cloudFront: simAws.cloudFront(),
    });

    // When the teardown reaches it, then it passes over rather than failing.
    creator.delete(new SimCfnResource({ logicalId: "BeaconPolicy" }));
  });
});

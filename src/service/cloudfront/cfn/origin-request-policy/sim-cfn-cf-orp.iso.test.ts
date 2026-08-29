import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsError,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../../cloudformation/template/sim-cfn-template.js";
import { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimCloudFrontOriginRequestPolicy } from "../../origin-request-policy/sim-cf-origin-request-policy.js";
import { SimCloudFrontDistribution } from "../../distribution/sim-cloudfront-distribution.js";
import { SimCfnCfOriginRequestPolicyConfig } from "./sim-cfn-cf-orp-config.js";
import { SimCfnCfOriginRequestPolicyCreator } from "./sim-cfn-cf-orp-creator.js";

const bucketName = "origin-request-policy-cfn-bucket";

/**
 * A template with an origin request policy of its own, and a Distribution
 * whose default Behavior points at it with a Ref.
 */
function siteTemplate(
  originRequestPolicyConfig: SimCfnTemplateValueRecord = {},
): CfnTemplateBodyRecord {
  return {
    Resources: {
      SiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: { BucketName: bucketName },
      },
      BeaconPolicy: {
        Type: "AWS::CloudFront::OriginRequestPolicy",
        Properties: {
          OriginRequestPolicyConfig: {
            Name: "BeaconPolicy",
            CookiesConfig: { CookieBehavior: "none" },
            HeadersConfig: { HeaderBehavior: "none" },
            QueryStringsConfig: { QueryStringBehavior: "none" },
            ...originRequestPolicyConfig,
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
              OriginRequestPolicyId: { Ref: "BeaconPolicy" },
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

describe("AWS::CloudFront::OriginRequestPolicy", () => {
  it("creates a policy a Behavior can name", async () => {
    // Given a template declaring its own origin request policy.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "origin-request-policy-stack",
      template: siteTemplate(),
    });

    await stack.waitForDeployComplete();

    // When the created policy is read back.
    const resource = stack.getResource("BeaconPolicy");

    assertNonNullable(resource);
    assertInstanceOf(resource.simResource, SimCloudFrontOriginRequestPolicy);

    const policy = resource.simResource;

    // Then the policy is held under its name, rather than the Resource being
    // skipped.
    assertIdentical(policy.name, "BeaconPolicy");
    assertIdentical(
      simAws.cloudFront().getOriginRequestPolicyById(policy.id),
      policy,
    );

    // And the Behavior that Refs it reports its ID.
    const distributionResource = stack.getResource("SiteDistribution");

    assertNonNullable(distributionResource);
    assertInstanceOf(
      distributionResource.simResource,
      SimCloudFrontDistribution,
    );
    assertIdentical(
      distributionResource.simResource.behaviors[0]?.originRequestPolicyId,
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
      stackName: "origin-request-policy-comment-stack",
      template: siteTemplate({ Comment: "Only the Origin header" }),
    });

    await stack.waitForDeployComplete();

    const resource = stack.getResource("BeaconPolicy");

    assertNonNullable(resource);
    assertInstanceOf(resource.simResource, SimCloudFrontOriginRequestPolicy);

    // Then the comment is what the template wrote.
    assertIdentical(resource.simResource.comment, "Only the Origin header");
  });

  it("forgets the policy when the Stack is torn down", async () => {
    // Given a deployed Stack holding a policy.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "origin-request-policy-teardown-stack",
      template: siteTemplate(),
    });

    await stack.waitForDeployComplete();

    const resource = stack.getResource("BeaconPolicy");

    assertNonNullable(resource);
    assertInstanceOf(resource.simResource, SimCloudFrontOriginRequestPolicy);

    const policyId = resource.simResource.id;

    // When the Stack is deleted.
    await simAws.cloudFormation().deleteStack({
      input: { StackName: "origin-request-policy-teardown-stack" },
    });
    await simAws.backgroundTasksComplete();

    // Then nothing answers to the policy's ID.
    assertUndefined(simAws.cloudFront().getOriginRequestPolicyById(policyId));
  });

  it("refuses a Resource whose OriginRequestPolicyConfig is not an object", async () => {
    // Given a template whose policy config is a string.
    const simAws = new SimAws();

    // When it is deployed.
    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "origin-request-policy-invalid-stack",
        template: {
          Resources: {
            BeaconPolicy: {
              Type: "AWS::CloudFront::OriginRequestPolicy",
              Properties: { OriginRequestPolicyConfig: "BeaconPolicy" },
            },
          },
        },
      });

      await stack.waitForDeployComplete();
    });

    // Then the refusal names the Resource and the part that could not be read.
    assertStringIncludes(error.message, "BeaconPolicy");
    assertStringIncludes(
      error.message,
      "OriginRequestPolicyConfig must be an object",
    );
  });

  it("refuses a Resource with no Name", () => {
    // Given a policy config that left its Name out.
    const config = new SimCfnCfOriginRequestPolicyConfig({
      resource: new SimCfnResource({ logicalId: "BeaconPolicy" }),
      properties: {
        OriginRequestPolicyConfig: {
          CookiesConfig: { CookieBehavior: "none" },
        },
      },
    });

    // When it is read.
    const error = assertThrowsError(() => config.build());

    // Then the refusal says which field is missing.
    assertStringIncludes(error.message, "needs a string Name");
  });

  it("has nothing to forget for a Resource that never created a policy", () => {
    // Given a Resource whose creation never ran, so it holds no policy.
    const simAws = new SimAws();
    const creator = new SimCfnCfOriginRequestPolicyCreator({
      cloudFront: simAws.cloudFront(),
    });

    // When the teardown reaches it, then it passes over rather than failing.
    creator.delete(new SimCfnResource({ logicalId: "BeaconPolicy" }));
  });
});

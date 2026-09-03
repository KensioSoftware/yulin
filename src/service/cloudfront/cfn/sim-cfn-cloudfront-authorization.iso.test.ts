import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import { simIamRoleWithPolicyFactory } from "../../iam/role/sim-iam-role-with-policy.factory.js";
import { SimCloudFrontCachePolicy } from "../cache-policy/sim-cf-cache-policy.js";

/**
 * One of the four CloudFront Resource types a template is the only way to
 * make, and the two actions a deployment creating and deleting it needs.
 */
interface CloudFrontResourceType {
  readonly logicalId: string;
  readonly createAction: string;
  readonly deleteAction: string;
  readonly resource: SimCfnTemplateValueRecord;
}

const cachePolicyType: CloudFrontResourceType = {
  logicalId: "SiteCachePolicy",
  createAction: "cloudfront:CreateCachePolicy",
  deleteAction: "cloudfront:DeleteCachePolicy",
  resource: {
    Type: "AWS::CloudFront::CachePolicy",
    Properties: {
      CachePolicyConfig: {
        Name: "site-caching",
        MinTTL: 0,
        ParametersInCacheKeyAndForwardedToOrigin: {
          EnableAcceptEncodingGzip: false,
          CookiesConfig: { CookieBehavior: "none" },
          HeadersConfig: { HeaderBehavior: "none" },
          QueryStringsConfig: { QueryStringBehavior: "none" },
        },
      },
    },
  },
};

const originRequestPolicyType: CloudFrontResourceType = {
  logicalId: "SiteOriginRequestPolicy",
  createAction: "cloudfront:CreateOriginRequestPolicy",
  deleteAction: "cloudfront:DeleteOriginRequestPolicy",
  resource: {
    Type: "AWS::CloudFront::OriginRequestPolicy",
    Properties: {
      OriginRequestPolicyConfig: {
        Name: "site-origin-requests",
        CookiesConfig: { CookieBehavior: "none" },
        HeadersConfig: { HeaderBehavior: "none" },
        QueryStringsConfig: { QueryStringBehavior: "none" },
      },
    },
  },
};

const responseHeadersPolicyType: CloudFrontResourceType = {
  logicalId: "SiteResponseHeadersPolicy",
  createAction: "cloudfront:CreateResponseHeadersPolicy",
  deleteAction: "cloudfront:DeleteResponseHeadersPolicy",
  resource: {
    Type: "AWS::CloudFront::ResponseHeadersPolicy",
    Properties: {
      ResponseHeadersPolicyConfig: { Name: "site-response-headers" },
    },
  },
};

const originAccessControlType: CloudFrontResourceType = {
  logicalId: "SiteOriginAccessControl",
  createAction: "cloudfront:CreateOriginAccessControl",
  deleteAction: "cloudfront:DeleteOriginAccessControl",
  resource: {
    Type: "AWS::CloudFront::OriginAccessControl",
    Properties: {
      OriginAccessControlConfig: {
        Name: "site-oac",
        OriginAccessControlOriginType: "s3",
        SigningBehavior: "always",
        SigningProtocol: "sigv4",
      },
    },
  },
};

const resourceTypes: readonly CloudFrontResourceType[] = [
  cachePolicyType,
  originRequestPolicyType,
  responseHeadersPolicyType,
  originAccessControlType,
];

/**
 * The actions a deployment creating all four of them needs.
 */
const createActions = resourceTypes.map(
  (resourceType) => resourceType.createAction,
);

/**
 * A template holding one of the four on its own, so a refusal names the
 * Resource the test is about rather than whichever one the deployment reached
 * first.
 */
function templateFor(
  resourceType: CloudFrontResourceType,
): CfnTemplateBodyRecord {
  return { Resources: { [resourceType.logicalId]: resourceType.resource } };
}

/**
 * A template holding all four.
 */
function everyResourceTemplate(): CfnTemplateBodyRecord {
  return {
    Resources: Object.fromEntries(
      resourceTypes.map((resourceType) => [
        resourceType.logicalId,
        resourceType.resource,
      ]),
    ),
  };
}

/**
 * A deploy Role allowed the CloudFront actions it is given, and nothing else.
 */
async function deployRole(
  simAws: SimAws,
  roleName: string,
  actions: readonly string[],
): Promise<SimAwsCaller> {
  const role = await simIamRoleWithPolicyFactory.make(
    { roleName, policyName: `${roleName}-policy`, actions },
    simAws,
  );

  return { kind: "arn", arn: role.Arn };
}

describe("the caller a CloudFront CloudFormation Resource is created as", () => {
  it.each(resourceTypes)(
    "refuses $logicalId under $createAction",
    async (resourceType) => {
      // Given a deploy Role holding a CloudFront permission that does not
      // cover this Resource type.
      const simAws = new SimAws();
      const deployer = await deployRole(simAws, "distro-deployer", [
        "cloudfront:CreateDistribution",
      ]);

      // When a Stack declaring the Resource is deployed as that Role.
      const error = await assertThrowsErrorAsync(async () => {
        await simAws.cloudFormation().deployTemplate({
          stackName: "site-stack",
          template: templateFor(resourceType),
          caller: deployer,
        });
      });

      // Then the deployment is refused, naming the action the policy is
      // missing, as real CloudFormation refuses the same template.
      assertStringIncludes(error.message, resourceType.createAction);
      assertStringIncludes(error.message, "role/distro-deployer");
      assertIdentical(
        simAws
          .cloudFormation()
          .getStackByName("site-stack")
          ?.getResource(resourceType.logicalId)?.status,
        "CREATE_FAILED",
      );
    },
  );

  it("creates a cache policy the deploy Role is allowed to create", async () => {
    // Given a deploy Role allowed to create cache policies.
    const simAws = new SimAws();
    const deployer = await deployRole(simAws, "policy-deployer", [
      "cloudfront:CreateCachePolicy",
    ]);

    // When a Stack declaring one is deployed as that Role.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "site-stack",
      template: templateFor(cachePolicyType),
      caller: deployer,
    });

    // Then the policy was created and stored under its ID.
    const resource = stack.getResource("SiteCachePolicy");
    assertNonNullable(resource);
    assertIdentical(resource.status, "CREATE_COMPLETE");
    assertInstanceOf(resource.simResource, SimCloudFrontCachePolicy);
    assertIdentical(
      simAws.cloudFront().getCachePolicyById(resource.simResource.id),
      resource.simResource,
    );
  });

  it("creates all four for a deployment naming no caller", async () => {
    // Given a deployment that names no principal, which is decided as the
    // Account root.
    const simAws = new SimAws();

    // When a Stack declaring all four is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "site-stack",
      template: everyResourceTemplate(),
    });

    // Then each of them was created, as it was before any of this asked IAM.
    for (const resourceType of resourceTypes) {
      assertIdentical(
        stack.getResource(resourceType.logicalId)?.status,
        "CREATE_COMPLETE",
      );
    }
  });

  it.each(resourceTypes)(
    "refuses tearing $logicalId down without $deleteAction",
    async (resourceType) => {
      // Given a Stack deployed as a Role allowed to create all four and to
      // delete none of them.
      const simAws = new SimAws();
      const deployer = await deployRole(
        simAws,
        "create-only-deployer",
        createActions,
      );
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "site-stack",
        template: templateFor(resourceType),
        caller: deployer,
      });

      // When the Stack is torn down.
      const error = await assertThrowsErrorAsync(async () => {
        await stack.teardown();
      });

      // Then the teardown is refused, naming the delete action.
      assertStringIncludes(error.message, resourceType.deleteAction);
    },
  );

  it("deletes a cache policy the deploy Role is allowed to delete", async () => {
    // Given a Stack deployed as a Role allowed both cache policy actions.
    const simAws = new SimAws();
    const deployer = await deployRole(simAws, "policy-deployer", [
      "cloudfront:CreateCachePolicy",
      "cloudfront:DeleteCachePolicy",
    ]);
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "site-stack",
      template: templateFor(cachePolicyType),
      caller: deployer,
    });
    const created = stack.getResource("SiteCachePolicy")?.simResource;
    assertInstanceOf(created, SimCloudFrontCachePolicy);

    // When the Stack is torn down.
    await stack.teardown();

    // Then the policy has gone with it.
    assertUndefined(simAws.cloudFront().getCachePolicyById(created.id));
  });
});

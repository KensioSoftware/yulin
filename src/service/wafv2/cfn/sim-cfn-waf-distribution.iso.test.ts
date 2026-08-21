import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simCfSiteBucket,
  simCfSiteRequest,
} from "../../../../test/cloudfront/site-fixture.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnDeployedStack } from "../../cloudformation/stack/sim-cfn-deployed-stack.type.js";
import type { CfnTemplateBodyRecord } from "../../cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";

const bucketName = "acl-site";

/** How a distribution names the web ACL beside it in the same template. */
const webAclArnReference = { "Fn::GetAtt": ["SiteAcl", "Arn"] };

/** An ARN of the right shape naming a web ACL nothing created. */
const missingWebAclArn =
  "arn:aws:wafv2:us-east-1:888888888888:global/webacl/gone/" +
  "4a2b1c8d-0e6f-4a2b-9c8d-0e6f4a2b1c8d";

const visibility = {
  SampledRequestsEnabled: false,
  CloudWatchMetricsEnabled: false,
  MetricName: "site",
};

/**
 * The rule the site's web ACL carries, blocking whatever asks for an admin
 * path.
 */
const blockAdmin = {
  Name: "block-admin",
  Priority: 0,
  Action: { Block: {} },
  Statement: {
    ByteMatchStatement: {
      FieldToMatch: { UriPath: {} },
      PositionalConstraint: "CONTAINS",
      SearchString: "/admin",
      TextTransformations: [{ Priority: 0, Type: "NONE" }],
    },
  },
  VisibilityConfig: { ...visibility, MetricName: "block-admin" },
};

/**
 * A rule blocking whole countries, which Yulin does not evaluate: every
 * request in this simulation comes from one address.
 */
const blockCountries = {
  Name: "block-countries",
  Priority: 0,
  Action: { Block: {} },
  Statement: { GeoMatchStatement: { CountryCodes: ["CN", "RU"] } },
  VisibilityConfig: { ...visibility, MetricName: "block-countries" },
};

/**
 * A template serving a bucket through a distribution the web ACL beside it
 * protects.
 *
 * CloudFront is not associated through AWS::WAFv2::WebACLAssociation. The
 * distribution carries the web ACL itself, in a `WebACLId` that is named for
 * WAF Classic and holds a WAFv2 ARN, so the reference between the two is an
 * ordinary Fn::GetAtt in the same template.
 */
function siteTemplate(
  webAclId: SimCfnTemplateValueRecord | string = webAclArnReference,
  scope = "CLOUDFRONT",
  rules: readonly SimCfnTemplateValueRecord[] = [blockAdmin],
): CfnTemplateBodyRecord {
  return {
    Resources: {
      SiteAcl: {
        Type: "AWS::WAFv2::WebACL",
        Properties: {
          Name: "site-acl",
          Scope: scope,
          DefaultAction: { Allow: {} },
          VisibilityConfig: visibility,
          Rules: [...rules],
        },
      },
      SiteDistribution: {
        Type: "AWS::CloudFront::Distribution",
        Properties: {
          DistributionConfig: {
            Enabled: true,
            WebACLId: webAclId,
            Origins: {
              Items: [
                {
                  Id: "site-origin",
                  DomainName: `${bucketName}.s3.amazonaws.com`,
                  S3OriginConfig: { OriginAccessIdentity: "" },
                },
              ],
            },
            DefaultCacheBehavior: {
              TargetOriginId: "site-origin",
              ViewerProtocolPolicy: "allow-all",
            },
          },
        },
      },
    },
    Outputs: {
      DistributionId: { Value: { Ref: "SiteDistribution" } },
    },
  };
}

/**
 * Deploy the site, with the pages a request here asks for already in place.
 */
async function deploySite(
  simAws: SimAws,
  webAclId?: SimCfnTemplateValueRecord | string,
): Promise<SimCfnDeployedStack> {
  await simCfSiteBucket(simAws, bucketName, {
    "index.html": "<h1>Home</h1>",
    "admin/index.html": "<h1>Admin</h1>",
  });

  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "site",
    template: webAclId === undefined ? siteTemplate() : siteTemplate(webAclId),
  });
  await stack.waitForDeployComplete();

  return stack;
}

async function siteResponse(
  simAws: SimAws,
  stack: SimCfnDeployedStack,
  path: string,
): Promise<Response> {
  const distributionId = stack.outputs.get("DistributionId")?.value;
  assertTypeString(distributionId);

  return await simCfSiteRequest(simAws, distributionId, path);
}

describe("A web ACL a CloudFormation Distribution names in WebACLId", () => {
  it("blocks a request the deployed web ACL claims", async () => {
    // Given a deployed distribution whose WebACLId resolved to the web ACL in
    // the same template.
    const simAws = new SimAws();
    const stack = await deploySite(simAws);

    // When a page the web ACL blocks and one it allows are both requested.
    const blocked = await siteResponse(simAws, stack, "/admin/index.html");
    const allowed = await siteResponse(simAws, stack, "/index.html");

    // Then the edge answered the first with WAF's own 403 and served the
    // second from the Origin.
    assertIdentical(blocked.status, 403);
    assertStringIncludes(await blocked.text(), "Request blocked by AWS WAF");
    assertIdentical(allowed.status, 200);
    assertIdentical(await allowed.text(), "<h1>Home</h1>");
  });

  it("serves from a distribution naming a web ACL that is not there", async () => {
    // Given a template whose WebACLId is a literal ARN nothing created, which
    // is what a stack deployed against a real account carries.
    const simAws = new SimAws();
    const stack = await deploySite(simAws, missingWebAclArn);

    // Then the distribution deployed with nothing in front of it and serves
    // every request, including the ones the web ACL would have decided. The
    // property it was deployed without says which web ACL went missing.
    const response = await siteResponse(simAws, stack, "/admin/index.html");
    const [ignoredProperty] = stack.ignoredProperties;

    assertIdentical(response.status, 200);
    assertNonNullable(ignoredProperty);
    assertIdentical(ignoredProperty.path, "DistributionConfig.WebACLId");
    assertStringIncludes(ignoredProperty.reason, missingWebAclArn);
  });

  it("serves from a distribution whose web ACL lost a rule", async () => {
    // Given a template whose web ACL rate limits requests, which Yulin does
    // not evaluate, in front of the distribution serving the site.
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, bucketName, {
      "index.html": "<h1>Home</h1>",
      "admin/index.html": "<h1>Admin</h1>",
    });

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "rate-limited-site",
      template: siteTemplate(webAclArnReference, "CLOUDFRONT", [
        blockCountries,
        blockAdmin,
      ]),
    });
    await stack.waitForDeployComplete();

    // Then the distribution deployed behind what the web ACL still holds. The
    // rule it lost is recorded, and the rule it kept still blocks.
    const blocked = await siteResponse(simAws, stack, "/admin/index.html");

    assertArrayLength(stack.skippedResources, 0);
    assertIdentical(blocked.status, 403);
    assertIdentical(stack.ignoredProperties[0]?.path, "Rules.block-countries");
  });

  it("refuses a distribution naming a REGIONAL scope web ACL", async () => {
    // Given a template whose web ACL is in the scope an API Gateway stage
    // takes, named by the distribution beside it.
    const simAws = new SimAws();
    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "regional-site",
        template: siteTemplate(webAclArnReference, "REGIONAL"),
      });
      await stack.waitForDeployComplete();
    });

    // Then the deployment failed on the scope, which is the mistake a
    // distribution and an association are easiest to mix up over.
    assertStringIncludes(error.message, "REGIONAL scope web ACL");
  });
});

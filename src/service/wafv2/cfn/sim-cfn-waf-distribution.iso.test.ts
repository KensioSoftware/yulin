import {
  assertIdentical,
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
import type { SimCfnStack } from "../../cloudformation/stack/sim-cfn-stack.js";
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
          Rules: [
            {
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
            },
          ],
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
): Promise<SimCfnStack> {
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
  stack: SimCfnStack,
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

  it("refuses a distribution naming a web ACL that is not there", async () => {
    // Given a template whose WebACLId is a literal ARN nothing created.
    const simAws = new SimAws();
    const error = await assertThrowsErrorAsync(async () => {
      await deploySite(simAws, missingWebAclArn);
    });

    // Then the deployment failed rather than leaving a distribution in front
    // of nothing, naming the ARN it could not resolve.
    assertStringIncludes(error.message, missingWebAclArn);
    assertStringIncludes(error.message, "does not exist");
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

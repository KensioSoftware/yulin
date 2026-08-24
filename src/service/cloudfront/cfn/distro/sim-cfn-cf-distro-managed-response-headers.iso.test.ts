import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { PutObjectCommand } from "@aws-sdk/client-s3";

import { SimAws } from "../../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../../cloudformation/template/sim-cfn-template.js";
import { grantPublicObjectRead } from "../../../s3/bucket/sim-s3-public-read.fixture.js";
import { SimCloudFrontDistribution } from "../../distribution/sim-cloudfront-distribution.js";
import { simCfManagedResponseHeadersPolicyIds } from "../../response-headers-policy/sim-cf-managed-response-headers-policies.js";
import { simCfSiteRequest } from "../../../../../test/cloudfront/site-fixture.js";

const bucketName = "managed-policy-site-bucket";

/**
 * A template naming a managed response headers policy on its default cache
 * Behavior, with no Resource behind the ID.
 *
 * This is the shape `aws-cdk-lib` 2.263.0 synthesizes for a `Distribution`
 * given `responseHeadersPolicy: ResponseHeadersPolicy.SECURITY_HEADERS`. The
 * `CachePolicyId` is CDK's `CachingOptimized` default, and it comes along to
 * keep the Behavior the one CDK writes rather than a tidied version of it.
 * The template is written out rather than synthesized so this stays an
 * isolated test.
 */
function siteTemplate(responseHeadersPolicyId: string): CfnTemplateBodyRecord {
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
              CachePolicyId: "658327ea-f89d-4fab-a63d-7e88639e58f6",
              Compress: true,
              TargetOriginId: "SiteOrigin",
              ViewerProtocolPolicy: "allow-all",
              ResponseHeadersPolicyId: responseHeadersPolicyId,
            },
          },
        },
      },
    },
  };
}

describe("CloudFormation Distribution on a managed response headers policy", () => {
  async function deployedSite(
    responseHeadersPolicyId: string,
  ): Promise<{ simAws: SimAws; distributionId: string }> {
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "managed-response-headers-stack",
      template: siteTemplate(responseHeadersPolicyId),
    });

    await stack.waitForDeployComplete();

    await grantPublicObjectRead(simAws.s3(), bucketName);
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: "index.html",
        ContentType: "text/html",
        Body: "<h1>Home</h1>",
      }),
    );

    const resource = stack.getResource("SiteDistribution");

    assertNonNullable(resource);
    assertInstanceOf(resource.simResource, SimCloudFrontDistribution);

    return { simAws, distributionId: resource.simResource.distributionId };
  }

  it("serves the security headers a CDK stack asks for by managed ID", async () => {
    // Given a stack whose Behavior names SecurityHeadersPolicy, which is what
    // ResponseHeadersPolicy.SECURITY_HEADERS synthesizes to.
    const { simAws, distributionId } = await deployedSite(
      simCfManagedResponseHeadersPolicyIds.securityHeaders,
    );

    // When a page is requested.
    const home = await simCfSiteRequest(simAws, distributionId, "/");

    // Then the response carries the headers AWS documents for the policy,
    // with no Resource in the template having created it.
    assertIdentical(
      home.headers.get("strict-transport-security"),
      "max-age=31536000",
    );
    assertIdentical(home.headers.get("x-content-type-options"), "nosniff");
    assertIdentical(home.headers.get("x-frame-options"), "SAMEORIGIN");
  });

  it("answers a cross-origin request through a managed CORS policy", async () => {
    // Given a stack whose Behavior names SimpleCORS.
    const { simAws, distributionId } = await deployedSite(
      simCfManagedResponseHeadersPolicyIds.simpleCors,
    );

    // When a browser on another Origin requests the page.
    const home = await simCfSiteRequest(simAws, distributionId, "/", {
      headers: { Origin: "https://app.example.com" },
    });

    // Then the wildcard comes back, which is the whole of SimpleCORS.
    assertIdentical(home.headers.get("access-control-allow-origin"), "*");
  });
});

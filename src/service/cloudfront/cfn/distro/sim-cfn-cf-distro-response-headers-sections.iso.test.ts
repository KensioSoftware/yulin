import { describe, it } from "vitest";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertResponseStatus,
  describeResponse,
} from "@kensio/smartass";
import { PutObjectCommand } from "@aws-sdk/client-s3";

import { SimAws } from "../../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../../cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { grantPublicObjectRead } from "../../../s3/bucket/sim-s3-public-read.fixture.js";
import { SimCloudFrontDistribution } from "../../distribution/sim-cloudfront-distribution.js";
import { simCfSiteRequest } from "../../../../../test/cloudfront/site-fixture.js";

/**
 * A template declaring a response headers policy and a Distribution applying
 * it, the way CDK synthesizes the pair. Split from
 * sim-cfn-cf-distro-response-headers.iso.test.ts, which covers
 * CustomHeadersConfig and RemoveHeadersConfig, because this project holds
 * every test file to a line count and the sections here — security headers,
 * Server-Timing, CORS and the policy ID a Behavior names — are enough on
 * their own to reach it.
 */
function siteTemplate(
  policyConfig: SimCfnTemplateValueRecord,
  distributionConfig: SimCfnTemplateValueRecord = {},
): CfnTemplateBodyRecord {
  return {
    Resources: {
      SiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: { BucketName: "headers-sections-site-bucket" },
      },
      CacheHeaders: {
        Type: "AWS::CloudFront::ResponseHeadersPolicy",
        Properties: { ResponseHeadersPolicyConfig: policyConfig },
      },
      SiteDistribution: {
        Type: "AWS::CloudFront::Distribution",
        DependsOn: ["SiteBucket", "CacheHeaders"],
        Properties: {
          DistributionConfig: {
            DefaultRootObject: "index.html",
            Origins: [
              {
                Id: "SiteOrigin",
                DomainName: "headers-sections-site-bucket.s3.amazonaws.com",
                S3OriginConfig: {},
              },
            ],
            DefaultCacheBehavior: {
              TargetOriginId: "SiteOrigin",
              ViewerProtocolPolicy: "redirect-to-https",
              ResponseHeadersPolicyId: { Ref: "CacheHeaders" },
            },
            ...distributionConfig,
          },
        },
      },
    },
  };
}

describe("CloudFormation Distribution response headers policy sections", () => {
  async function deployedSite(
    policyConfig: SimCfnTemplateValueRecord,
  ): Promise<{ simAws: SimAws; distributionId: string }> {
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "response-headers-sections-stack",
      template: siteTemplate(policyConfig),
    });

    const resource = stack.getResource("SiteDistribution");

    assertNonNullable(resource);
    assertInstanceOf(resource.simResource, SimCloudFrontDistribution);

    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "headers-sections-site-bucket",
        Key: "index.html",
        ContentType: "text/html",
        Body: "<h1>Home</h1>",
      }),
    );
    await grantPublicObjectRead(simAws.s3(), "headers-sections-site-bucket");

    return { simAws, distributionId: resource.simResource.distributionId };
  }

  it("applies a policy's security headers to what the Distribution serves", async () => {
    // Given a Distribution whose policy sets every security header section.
    const { simAws, distributionId } = await deployedSite({
      Name: "CacheHeaders",
      SecurityHeadersConfig: {
        ContentSecurityPolicy: {
          ContentSecurityPolicy: "default-src 'self'",
          Override: true,
        },
        ContentTypeOptions: { Override: true },
        FrameOptions: { FrameOption: "DENY", Override: true },
        ReferrerPolicy: { ReferrerPolicy: "same-origin", Override: true },
        StrictTransportSecurity: {
          AccessControlMaxAgeSec: 31_536_000,
          IncludeSubdomains: true,
          Preload: true,
          Override: true,
        },
        XSSProtection: { Protection: true, ModeBlock: true, Override: true },
      },
    });

    // When a page is requested.
    const home = await simCfSiteRequest(simAws, distributionId, "/");

    // Then every section's header is on the response, which is what CDK's
    // securityHeadersBehavior needs to be exercised locally.
    assertResponseStatus(home, 200, await describeResponse(home));
    assertIdentical(
      home.headers.get("content-security-policy"),
      "default-src 'self'",
    );
    assertIdentical(home.headers.get("x-content-type-options"), "nosniff");
    assertIdentical(home.headers.get("x-frame-options"), "DENY");
    assertIdentical(home.headers.get("referrer-policy"), "same-origin");
    assertIdentical(
      home.headers.get("strict-transport-security"),
      "max-age=31536000; includeSubDomains; preload",
    );
    assertIdentical(home.headers.get("x-xss-protection"), "1; mode=block");
  });

  it("adds a Server-Timing header once the policy enables it", async () => {
    // Given a policy enabling the Server-Timing header.
    const { simAws, distributionId } = await deployedSite({
      Name: "CacheHeaders",
      ServerTimingHeadersConfig: { Enabled: true, SamplingRate: 100 },
    });

    // When a page is requested.
    const home = await simCfSiteRequest(simAws, distributionId, "/");

    // Then the header is present.
    assertNonNullable(home.headers.get("server-timing"));
  });

  it("reflects an allowed Origin in a policy's CORS headers", async () => {
    // Given a policy allowing one Origin.
    const { simAws, distributionId } = await deployedSite({
      Name: "CacheHeaders",
      CorsConfig: {
        AccessControlAllowCredentials: false,
        AccessControlAllowHeaders: { Items: ["*"] },
        AccessControlAllowMethods: { Items: ["GET", "HEAD"] },
        AccessControlAllowOrigins: { Items: ["https://example.com"] },
        OriginOverride: true,
      },
    });

    // When a page is requested with that Origin.
    const home = await simCfSiteRequest(simAws, distributionId, "/", {
      headers: { Origin: "https://example.com" },
    });

    // Then the CORS headers name it, and the response varies on Origin.
    assertIdentical(
      home.headers.get("access-control-allow-origin"),
      "https://example.com",
    );
    assertIdentical(
      home.headers.get("access-control-allow-methods"),
      "GET,HEAD",
    );
    assertIdentical(home.headers.get("vary"), "Origin");
  });

  it("omits a policy's CORS headers for an Origin it does not allow", async () => {
    // Given the same policy.
    const { simAws, distributionId } = await deployedSite({
      Name: "CacheHeaders",
      CorsConfig: {
        AccessControlAllowCredentials: false,
        AccessControlAllowHeaders: { Items: ["*"] },
        AccessControlAllowMethods: { Items: ["GET"] },
        AccessControlAllowOrigins: { Items: ["https://example.com"] },
        OriginOverride: true,
      },
    });

    // When a page is requested with an Origin the policy does not allow.
    const home = await simCfSiteRequest(simAws, distributionId, "/", {
      headers: { Origin: "https://evil.example" },
    });

    // Then none of the CORS headers are added, as CloudFront sends none
    // rather than a mismatched one.
    assertIdentical(home.headers.get("access-control-allow-origin"), null);
  });
});

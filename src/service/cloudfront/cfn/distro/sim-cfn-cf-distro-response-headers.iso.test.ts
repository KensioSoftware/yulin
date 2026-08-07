import { describe, it } from "vitest";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertResponseStatus,
  assertStringIncludes,
  assertThrowsErrorAsync,
  describeResponse,
} from "@kensio/smartass";
import { PutObjectCommand } from "@aws-sdk/client-s3";

import { SimAws } from "../../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../../cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { grantPublicObjectRead } from "../../../s3/bucket/sim-s3-public-read.fixture.js";
import { SimCloudFrontDistribution } from "../../distribution/sim-cloudfront-distribution.js";
import { SimCloudFrontResponseHeadersPolicy } from "../../response-headers-policy/sim-cf-response-headers-policy.js";
import { simCfSiteRequest } from "../../../../../test/cloudfront/site-fixture.js";

/**
 * A template declaring a response headers policy and a Distribution applying
 * it, the way CDK synthesizes the pair.
 */
function siteTemplate(
  policyConfig: SimCfnTemplateValueRecord,
  distributionConfig: SimCfnTemplateValueRecord = {},
): CfnTemplateBodyRecord {
  return {
    Resources: {
      SiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: { BucketName: "headers-site-bucket" },
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
            CustomErrorResponses: [
              {
                ErrorCode: 404,
                ResponsePagePath: "/404.html",
                ResponseCode: 404,
              },
            ],
            Origins: [
              {
                Id: "SiteOrigin",
                DomainName: "headers-site-bucket.s3.amazonaws.com",
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

describe("CloudFormation Distribution response headers policies", () => {
  async function deployedSite(
    policyConfig: SimCfnTemplateValueRecord,
  ): Promise<{ simAws: SimAws; distributionId: string }> {
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "response-headers-stack",
      template: siteTemplate(policyConfig),
    });

    const resource = stack.getResource("SiteDistribution");

    assertNonNullable(resource);
    assertInstanceOf(resource.simResource, SimCloudFrontDistribution);

    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "headers-site-bucket",
        Key: "index.html",
        ContentType: "text/html",
        Body: "<h1>Home</h1>",
      }),
    );
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "headers-site-bucket",
        Key: "404.html",
        ContentType: "text/html",
        Body: "<h1>Not found</h1>",
      }),
    );
    await grantPublicObjectRead(simAws.s3(), "headers-site-bucket");

    return { simAws, distributionId: resource.simResource.distributionId };
  }

  it("applies a policy's headers to what the Distribution serves", async () => {
    // Given a Distribution whose default Behavior names a policy setting a
    // cache directive.
    const { simAws, distributionId } = await deployedSite({
      Name: "CacheHeaders",
      CustomHeadersConfig: {
        Items: [
          {
            Header: "Cache-Control",
            Override: true,
            Value: "public, max-age=0, must-revalidate",
          },
        ],
      },
    });

    // When a page is requested.
    const home = await simCfSiteRequest(simAws, distributionId, "/");

    // Then the policy's header is on the response.
    assertResponseStatus(home, 200, await describeResponse(home));
    assertIdentical(
      home.headers.get("cache-control"),
      "public, max-age=0, must-revalidate",
    );
  });

  it("applies a policy to a custom error page too", async () => {
    // Given the same Distribution, which answers a missing page with a custom
    // error response.
    const { simAws, distributionId } = await deployedSite({
      Name: "CacheHeaders",
      CustomHeadersConfig: {
        Items: [{ Header: "Vary", Override: true, Value: "Accept-Encoding" }],
      },
    });

    // When a page that does not exist is requested.
    const missing = await simCfSiteRequest(simAws, distributionId, "/missing");

    // Then the error page carries the policy's headers, because CloudFront
    // applies a policy after the response leaves the cache.
    assertResponseStatus(missing, 404, await describeResponse(missing));
    assertIdentical(missing.headers.get("vary"), "Accept-Encoding");
    assertIdentical(await missing.text(), "<h1>Not found</h1>");
  });

  it("keeps an Origin header the policy does not override", async () => {
    // Given a policy setting the content type the Origin already sets, without
    // Override.
    const { simAws, distributionId } = await deployedSite({
      Name: "CacheHeaders",
      CustomHeadersConfig: {
        Items: [
          { Header: "Content-Type", Override: false, Value: "text/plain" },
        ],
      },
    });

    // When a page is requested.
    const home = await simCfSiteRequest(simAws, distributionId, "/");

    // Then the Origin's value stands, as it does in CloudFront.
    assertIdentical(home.headers.get("content-type"), "text/html");
  });

  it("removes a header the policy is told to remove", async () => {
    // Given a policy removing a header the S3 Origin sets.
    const { simAws, distributionId } = await deployedSite({
      Name: "CacheHeaders",
      RemoveHeadersConfig: { Items: [{ Header: "Content-Type" }] },
    });

    // When a page is requested.
    const home = await simCfSiteRequest(simAws, distributionId, "/");

    // Then the header is gone.
    assertIdentical(home.headers.get("content-type"), null);
  });

  it("stores the policy under the ID a Ref gives the Distribution", async () => {
    // Given a deployed template.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "response-headers-ref-stack",
      template: siteTemplate({
        Name: "CacheHeaders",
        CustomHeadersConfig: {
          Items: [{ Header: "Vary", Override: true, Value: "Accept-Encoding" }],
        },
      }),
    });

    const policyResource = stack.getResource("CacheHeaders");

    assertNonNullable(policyResource);
    assertInstanceOf(
      policyResource.simResource,
      SimCloudFrontResponseHeadersPolicy,
    );

    // Then a Ref to the policy is its ID, and the Distribution can find it.
    const distributionResource = stack.getResource("SiteDistribution");

    assertNonNullable(distributionResource);
    assertInstanceOf(
      distributionResource.simResource,
      SimCloudFrontDistribution,
    );
    assertIdentical(
      distributionResource.simResource.behaviors[0]?.responseHeadersPolicyId,
      policyResource.simResource.id,
    );
    assertNonNullable(
      simAws
        .cloudFront()
        .getResponseHeadersPolicyById(policyResource.simResource.id),
    );
  });

  it("fails the stack for a second policy claiming a name", async () => {
    // Given a template declaring two response headers policies with one name,
    // which CloudFront refuses because a policy name is unique in an account.
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "duplicate-policy-name-stack",
        template: {
          Resources: {
            CacheHeaders: {
              Type: "AWS::CloudFront::ResponseHeadersPolicy",
              Properties: {
                ResponseHeadersPolicyConfig: { Name: "CacheHeaders" },
              },
            },
            MoreCacheHeaders: {
              Type: "AWS::CloudFront::ResponseHeadersPolicy",
              DependsOn: "CacheHeaders",
              Properties: {
                ResponseHeadersPolicyConfig: { Name: "CacheHeaders" },
              },
            },
          },
        },
      });

      await stack.waitForDeployComplete();
    });

    // Then the second one is refused, rather than both deploying under IDs of
    // their own and diverging from what AWS would have done.
    assertStringIncludes(error.message, "CacheHeaders already exists");
  });

  it("fails the stack for a policy section it does not model", async () => {
    // Given a template whose policy sets security headers, which this
    // simulation does not model.
    const simAws = new SimAws();

    // When the template is deployed, then it fails rather than serving
    // responses missing the headers the policy promised.
    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "unmodelled-section-stack",
        template: siteTemplate({
          Name: "CacheHeaders",
          SecurityHeadersConfig: {
            StrictTransportSecurity: {
              AccessControlMaxAgeSec: 31_536_000,
              Override: true,
            },
          },
        }),
      });

      await stack.waitForDeployComplete();
    });

    // And the section is named for diagnosis.
    assertStringIncludes(error.message, "SecurityHeadersConfig");
    assertStringIncludes(error.message, "CacheHeaders");
  });
});

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
import { grantPublicObjectRead } from "../../../s3/bucket/sim-s3-public-read.fixture.js";
import { SimCloudFrontDistribution } from "../../distribution/sim-cloudfront-distribution.js";
import { simCfManagedCachePolicyIds } from "../../cache-policy/sim-cf-managed-cache-policies.js";
import { simCfSiteRequest } from "../../../../../test/cloudfront/site-fixture.js";

describe("CloudFormation Distribution error pages and root object", () => {
  it("serves a static site declared in a CloudFormation template", async () => {
    // Given a template declaring a static site the way CDK synthesizes one,
    // with the list properties as arrays and ResponseCode as an integer.
    const simAws = new SimAws();

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "static-site-stack",
      template: {
        Resources: {
          SiteBucket: {
            Type: "AWS::S3::Bucket",
            Properties: { BucketName: "cfn-site-bucket" },
          },
          SiteDistribution: {
            Type: "AWS::CloudFront::Distribution",
            DependsOn: "SiteBucket",
            Properties: {
              DistributionConfig: {
                DefaultRootObject: "index.html",
                CustomErrorResponses: [
                  {
                    ErrorCode: 404,
                    ResponsePagePath: "/404.html",
                    ResponseCode: 404,
                  },
                  {
                    ErrorCode: 403,
                    ResponsePagePath: "/404.html",
                    ResponseCode: 404,
                  },
                ],
                Origins: [
                  {
                    Id: "SiteOrigin",
                    DomainName: "cfn-site-bucket.s3.amazonaws.com",
                    S3OriginConfig: {},
                  },
                ],
                DefaultCacheBehavior: {
                  TargetOriginId: "SiteOrigin",
                  ViewerProtocolPolicy: "redirect-to-https",
                },
              },
            },
          },
        },
      },
    });

    const resource = stack.getResource("SiteDistribution");
    assertNonNullable(resource);
    assertInstanceOf(resource.simResource, SimCloudFrontDistribution);
    const distributionId = resource.simResource.distributionId;

    // And the site's pages in the Bucket the template created.
    const simS3 = simAws.s3();
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "cfn-site-bucket",
        Key: "index.html",
        ContentType: "text/html",
        Body: "<h1>Home</h1>",
      }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "cfn-site-bucket",
        Key: "404.html",
        ContentType: "text/html",
        Body: "<h1>Not found</h1>",
      }),
    );
    await grantPublicObjectRead(simS3, "cfn-site-bucket");

    // When the root of the Distribution is requested.
    const home = await simCfSiteRequest(simAws, distributionId, "/");

    // Then the default root object is served.
    assertResponseStatus(home, 200, await describeResponse(home));
    assertIdentical(await home.text(), "<h1>Home</h1>");

    // And when a page that does not exist is requested.
    const missing = await simCfSiteRequest(simAws, distributionId, "/missing");

    // Then the error page is served with the status the template asked for.
    assertResponseStatus(missing, 404, await describeResponse(missing));
    assertIdentical(await missing.text(), "<h1>Not found</h1>");
  });

  it("holds an error for an ErrorCachingMinTTL a template wrote as a string", async () => {
    // Given a template configuring error caching alone, with the seconds
    // written as a string, as a template can carry any scalar as one.
    const simAws = new SimAws();

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "error-caching-stack",
      template: {
        Resources: {
          SiteBucket: {
            Type: "AWS::S3::Bucket",
            Properties: { BucketName: "error-caching-bucket" },
          },
          SiteDistribution: {
            Type: "AWS::CloudFront::Distribution",
            DependsOn: "SiteBucket",
            Properties: {
              DistributionConfig: {
                CustomErrorResponses: [
                  { ErrorCode: 404, ErrorCachingMinTTL: "30" },
                ],
                Origins: [
                  {
                    Id: "SiteOrigin",
                    DomainName: "error-caching-bucket.s3.amazonaws.com",
                    S3OriginConfig: {},
                  },
                ],
                DefaultCacheBehavior: {
                  TargetOriginId: "SiteOrigin",
                  ViewerProtocolPolicy: "redirect-to-https",
                  CachePolicyId: simCfManagedCachePolicyIds.cachingOptimized,
                },
              },
            },
          },
        },
      },
    });

    const resource = stack.getResource("SiteDistribution");
    assertNonNullable(resource);
    assertInstanceOf(resource.simResource, SimCloudFrontDistribution);
    const distributionId = resource.simResource.distributionId;

    const simS3 = simAws.s3();
    await grantPublicObjectRead(simS3, "error-caching-bucket");

    // And a page the Bucket has no object for yet.
    const missing = await simCfSiteRequest(
      simAws,
      distributionId,
      "/page.html",
    );
    assertResponseStatus(missing, 404, await describeResponse(missing));

    // When the page is published and asked for inside the half minute.
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "error-caching-bucket",
        Key: "page.html",
        ContentType: "text/html",
        Body: "<h1>Published</h1>",
      }),
    );
    await simAws.clock().advanceBy({ seconds: 29 });
    const held = await simCfSiteRequest(simAws, distributionId, "/page.html");

    // Then the cache is still answering with the 404 the template's seconds
    // asked for.
    assertResponseStatus(held, 404, await describeResponse(held));

    // And when simulated time moves past the half minute.
    await simAws.clock().advanceBy({ seconds: 2 });
    const published = await simCfSiteRequest(
      simAws,
      distributionId,
      "/page.html",
    );

    // Then the request reached the Bucket, which now holds the page.
    assertIdentical(await published.text(), "<h1>Published</h1>");
  });

  it("fails the stack for an unusable default root object", async () => {
    // Given a template whose default root object begins with a forward slash.
    const simAws = new SimAws();

    // When the template is deployed.
    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "bad-root-object-stack",
        template: {
          Resources: {
            SiteBucket: {
              Type: "AWS::S3::Bucket",
              Properties: { BucketName: "bad-root-object-bucket" },
            },
            SiteDistribution: {
              Type: "AWS::CloudFront::Distribution",
              DependsOn: "SiteBucket",
              Properties: {
                DistributionConfig: {
                  DefaultRootObject: "/index.html",
                  Origins: [
                    {
                      Id: "SiteOrigin",
                      DomainName: "bad-root-object-bucket.s3.amazonaws.com",
                      S3OriginConfig: {},
                    },
                  ],
                  DefaultCacheBehavior: {
                    TargetOriginId: "SiteOrigin",
                    ViewerProtocolPolicy: "redirect-to-https",
                  },
                },
              },
            },
          },
        },
      });
      await stack.waitForDeployComplete();
    });

    // Then the stack fails rather than deploying a Distribution that would
    // answer its own root with a 403, naming the resource and the value.
    assertStringIncludes(error.message, "SiteDistribution");
    assertStringIncludes(error.message, "/index.html");
  });
});

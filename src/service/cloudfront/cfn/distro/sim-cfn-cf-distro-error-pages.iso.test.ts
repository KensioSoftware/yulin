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
import { SimCloudFrontDistribution } from "../../distribution/sim-cloudfront-distribution.js";
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

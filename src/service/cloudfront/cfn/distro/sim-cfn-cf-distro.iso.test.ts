import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimCloudFrontDistribution } from "../../distribution/sim-cloudfront-distribution.js";
import {
  deployedResourceObject,
  deployedStackObject,
} from "../../../cloudformation/stack/sim-cfn-stack.fixture.js";

describe("CloudFront CloudFormation Distribution", () => {
  it("creates a CloudFront Distribution from AWS::CloudFront::Distribution", async () => {
    // Given a CloudFormation template declaring a CloudFront Distribution.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "cloudfront-distribution-stack",
      template: {
        Resources: {
          SiteBucket: {
            Type: "AWS::S3::Bucket",
            Properties: {
              BucketName: "site-bucket",
            },
          },
          SiteDistribution: {
            Type: "AWS::CloudFront::Distribution",
            DependsOn: "SiteBucket",
            Properties: {
              DistributionConfig: {
                Aliases: {
                  Items: ["www.example.test"],
                },
                Origins: {
                  Items: [
                    {
                      Id: "SiteOrigin",
                      DomainName: "site-bucket.s3.amazonaws.com",
                      S3OriginConfig: {},
                    },
                  ],
                },
                DefaultCacheBehavior: {
                  TargetOriginId: "SiteOrigin",
                  ViewerProtocolPolicy: "redirect-to-https",
                  AllowedMethods: {
                    Items: ["GET", "HEAD"],
                    CachedMethods: {
                      Items: ["GET", "HEAD"],
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    // Then the CloudFormation Resource is backed by a simulated Distribution.
    const resource = stack.getResource("SiteDistribution");

    assertNonNullable(resource);
    assertInstanceOf(resource.simResource, SimCloudFrontDistribution);

    const distribution = resource.simResource;

    assertNonNullable(distribution);
    assertIdentical(distribution.status, "Deploying");
    assertTrue(distribution.hasAlternateDomainName("www.example.test"));
    assertNonNullable(distribution.getOrigin("SiteOrigin"));
  });

  it("uses Distribution ID for Ref and exposes DomainName via Fn::GetAtt", async () => {
    // Given a CloudFormation template with a Distribution and dependent output-like
    // resources that exercise Ref and Fn::GetAtt property resolution.
    const simAws = new SimAws();

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "cloudfront-distribution-ref-stack",
      template: {
        Resources: {
          SiteBucket: {
            Type: "AWS::S3::Bucket",
            Properties: {
              BucketName: "site-bucket",
            },
          },
          SiteDistribution: {
            Type: "AWS::CloudFront::Distribution",
            DependsOn: "SiteBucket",
            Properties: {
              DistributionConfig: {
                Origins: {
                  Items: [
                    {
                      Id: "SiteOrigin",
                      DomainName: "site-bucket.s3.amazonaws.com",
                      S3OriginConfig: {},
                    },
                  ],
                },
                DefaultCacheBehavior: {
                  TargetOriginId: "SiteOrigin",
                  ViewerProtocolPolicy: "allow-all",
                },
              },
            },
          },
          WaitHandle: {
            Type: "AWS::CloudFormation::WaitConditionHandle",
            Properties: {
              DistributionId: {
                Ref: "SiteDistribution",
              },
              DistributionDomainName: {
                "Fn::GetAtt": ["SiteDistribution", "DomainName"],
              },
              DistributionIdAttribute: {
                "Fn::GetAtt": ["SiteDistribution", "Id"],
              },
              DistributionFallbackAttribute: {
                "Fn::GetAtt": ["SiteDistribution", "UnsupportedAttribute"],
              },
            },
          },
        },
      },
    });

    // Then Ref returns the Distribution ID and Fn::GetAtt returns the simulated
    // CloudFront Distribution attributes.
    const distributionResource = stack.getResource("SiteDistribution");
    const waitHandleResource = stack.getResource("WaitHandle");

    assertNonNullable(distributionResource);
    assertNonNullable(waitHandleResource);

    const distributionId = distributionResource.refValue;

    assertTypeString(distributionId);

    const resolvedWaitHandleProperties = await deployedResourceObject(
      waitHandleResource,
    ).resolvedProperties({
      resources: deployedStackObject(stack).resources,
    });

    assertIdentical(
      resolvedWaitHandleProperties["DistributionId"],
      distributionId,
    );
    assertIdentical(
      resolvedWaitHandleProperties["DistributionDomainName"],
      `${distributionId.toLowerCase()}.cloudfront.net`,
    );
    assertIdentical(
      resolvedWaitHandleProperties["DistributionIdAttribute"],
      distributionId,
    );
    assertIdentical(
      resolvedWaitHandleProperties["DistributionFallbackAttribute"],
      `${distributionId}.UnsupportedAttribute`,
    );
  });

  it("fails with a helpful diagnostic when DistributionConfig is not an object", async () => {
    // Given a CloudFormation template declaring a CloudFront Distribution with an
    // unusable DistributionConfig value.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation, then deployment
    // fails with a DistributionConfig shape diagnostic.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployTemplate({
        stackName: "invalid-cloudfront-distribution-stack",
        template: {
          Resources: {
            SiteDistribution: {
              Type: "AWS::CloudFront::Distribution",
              Properties: {
                DistributionConfig: "not-an-object",
              },
            },
          },
        },
      }),
    );

    assertStringIncludes(
      error.message,
      "Invalid AWS::CloudFront::Distribution SiteDistribution: DistributionConfig must be an object",
    );
  });
});

/**
 * Reading back the origin request policy a Behavior was given.
 */

import { GetDistributionCommand } from "@aws-sdk/client-cloudfront";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "site-stack",
  template: {
    Resources: {
      SiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: { BucketName: "site-bucket" },
      },
      BeaconPolicy: {
        Type: "AWS::CloudFront::OriginRequestPolicy",
        Properties: {
          OriginRequestPolicyConfig: {
            Name: "BeaconPolicy",
            CookiesConfig: { CookieBehavior: "none" },
            HeadersConfig: { HeaderBehavior: "none" },
            QueryStringsConfig: { QueryStringBehavior: "all" },
          },
        },
      },
      SiteDistribution: {
        Type: "AWS::CloudFront::Distribution",
        DependsOn: ["SiteBucket", "BeaconPolicy"],
        Properties: {
          DistributionConfig: {
            DefaultRootObject: "index.html",
            Origins: [
              {
                Id: "SiteOrigin",
                DomainName: "site-bucket.s3.amazonaws.com",
                S3OriginConfig: {},
              },
            ],
            DefaultCacheBehavior: {
              TargetOriginId: "SiteOrigin",
              ViewerProtocolPolicy: "allow-all",
              // CORS-S3Origin, one of CloudFront's managed policies.
              OriginRequestPolicyId: "88a5eaf4-2fd4-4709-b370-b4c650ea3fcf",
            },
            CacheBehaviors: [
              {
                PathPattern: "/beacon",
                TargetOriginId: "SiteOrigin",
                ViewerProtocolPolicy: "allow-all",
                OriginRequestPolicyId: { Ref: "BeaconPolicy" },
              },
            ],
          },
        },
      },
    },
    Outputs: {
      DistributionId: { Value: { Ref: "SiteDistribution" } },
      BeaconPolicyId: { Value: { Ref: "BeaconPolicy" } },
    },
  },
});

await stack.waitForDeployComplete();

const read = await simAws
  .cloudFront()
  .getDistribution(
    new GetDistributionCommand({ Id: stack.output("DistributionId") }),
  );
const config = read.Distribution?.DistributionConfig;

// The managed ID the default Behavior was given.
console.log(config?.DefaultCacheBehavior?.OriginRequestPolicyId);

// The ID of the policy the template created, which the path Behavior Refs.
console.log(
  config?.CacheBehaviors?.Items?.[0]?.OriginRequestPolicyId ===
    stack.output("BeaconPolicyId"),
);

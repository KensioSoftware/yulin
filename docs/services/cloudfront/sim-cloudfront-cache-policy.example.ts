/**
 * Reading back the cache policy a Behavior was given.
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
        Type: "AWS::CloudFront::CachePolicy",
        Properties: {
          CachePolicyConfig: {
            Name: "BeaconPolicy",
            MinTTL: 0,
            DefaultTTL: 0,
            MaxTTL: 0,
            ParametersInCacheKeyAndForwardedToOrigin: {
              EnableAcceptEncodingGzip: false,
              CookiesConfig: { CookieBehavior: "none" },
              HeadersConfig: { HeaderBehavior: "none" },
              QueryStringsConfig: { QueryStringBehavior: "none" },
            },
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
              // CachingOptimized, one of CloudFront's managed policies.
              CachePolicyId: "658327ea-f89d-4fab-a63d-7e88639e58f6",
            },
            CacheBehaviors: [
              {
                PathPattern: "/beacon",
                TargetOriginId: "SiteOrigin",
                ViewerProtocolPolicy: "allow-all",
                CachePolicyId: { Ref: "BeaconPolicy" },
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
console.log(config?.DefaultCacheBehavior?.CachePolicyId);

// The ID of the policy the template created, which the path Behavior Refs.
console.log(
  config?.CacheBehaviors?.Items?.[0]?.CachePolicyId ===
    stack.output("BeaconPolicyId"),
);

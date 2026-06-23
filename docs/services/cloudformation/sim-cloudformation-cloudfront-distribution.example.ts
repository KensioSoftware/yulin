/**
 * Deploying a template with S3 and CloudFront resources.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "cloudfront-stack",
  template: {
    Resources: {
      SiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: "cloudfront-site-bucket",
        },
      },
      SiteDistribution: {
        Type: "AWS::CloudFront::Distribution",
        Properties: {
          DistributionConfig: {
            Aliases: ["cdn.example.test"],
            Enabled: true,
            Origins: [
              {
                Id: "SiteOrigin",
                DomainName: "cloudfront-site-bucket.s3.amazonaws.com",
                S3OriginConfig: {},
              },
            ],
            DefaultCacheBehavior: {
              TargetOriginId: "SiteOrigin",
              ViewerProtocolPolicy: "allow-all",
            },
          },
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

const distributionResource = stack.getResource("SiteDistribution");
console.log(distributionResource?.simResource);

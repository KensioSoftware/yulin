/**
 * Using Fn::GetAtt with a simulated CloudFront Distribution.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "get-att-stack",
  template: {
    Resources: {
      SiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: "get-att-site-bucket",
        },
      },
      SiteDistribution: {
        Type: "AWS::CloudFront::Distribution",
        Properties: {
          DistributionConfig: {
            Enabled: true,
            Origins: [
              {
                Id: "SiteOrigin",
                DomainName: "get-att-site-bucket.s3.amazonaws.com",
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
      DistributionNameHandle: {
        Type: "AWS::CloudFormation::WaitConditionHandle",
        Properties: {
          Value: {
            "Fn::GetAtt": ["SiteDistribution", "DomainName"],
          },
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

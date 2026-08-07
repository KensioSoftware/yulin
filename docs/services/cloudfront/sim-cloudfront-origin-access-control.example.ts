/**
 * Giving a Distribution's S3 Origin an origin access control.
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
      SiteOac: {
        Type: "AWS::CloudFront::OriginAccessControl",
        Properties: {
          OriginAccessControlConfig: {
            Name: "site-oac",
            OriginAccessControlOriginType: "s3",
            SigningBehavior: "always",
            SigningProtocol: "sigv4",
          },
        },
      },
      SiteDistribution: {
        Type: "AWS::CloudFront::Distribution",
        DependsOn: ["SiteBucket", "SiteOac"],
        Properties: {
          DistributionConfig: {
            Enabled: true,
            Origins: [
              {
                Id: "SiteOrigin",
                DomainName: "site-bucket.s3.amazonaws.com",
                S3OriginConfig: {},
                OriginAccessControlId: { Ref: "SiteOac" },
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
    Outputs: {
      DistributionId: { Value: { Ref: "SiteDistribution" } },
    },
  },
});

await stack.waitForDeployComplete();

const distributionId = stack.outputs.get("DistributionId")?.value as string;
const output = await simAws
  .cloudFront()
  .getDistribution(new GetDistributionCommand({ Id: distributionId }));

const [origin] = output.Distribution?.DistributionConfig?.Origins?.Items ?? [];

// The ID the Ref resolved to, which is the origin access control the Origin
// was created with.
console.log(origin?.OriginAccessControlId);

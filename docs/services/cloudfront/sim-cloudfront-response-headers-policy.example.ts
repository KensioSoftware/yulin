/**
 * Setting response headers on what a cache Behavior serves.
 */

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws });

try {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "site-stack",
    template: {
      Resources: {
        SiteBucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketName: "site-bucket",
            PublicAccessBlockConfiguration: {
              BlockPublicAcls: true,
              IgnorePublicAcls: true,
            },
          },
        },
        // The Origin reads the Bucket anonymously, so the site needs a policy
        // making it publicly readable.
        SiteBucketPolicy: {
          Type: "AWS::S3::BucketPolicy",
          DependsOn: "SiteBucket",
          Properties: {
            Bucket: "site-bucket",
            PolicyDocument: {
              Version: "2012-10-17",
              Statement: {
                Effect: "Allow",
                Principal: "*",
                Action: "s3:GetObject",
                Resource: "arn:aws:s3:::site-bucket/*",
              },
            },
          },
        },
        CacheHeaders: {
          Type: "AWS::CloudFront::ResponseHeadersPolicy",
          Properties: {
            ResponseHeadersPolicyConfig: {
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
            },
          },
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
                  DomainName: "site-bucket.s3.amazonaws.com",
                  S3OriginConfig: {},
                },
              ],
              DefaultCacheBehavior: {
                TargetOriginId: "SiteOrigin",
                ViewerProtocolPolicy: "allow-all",
                ResponseHeadersPolicyId: { Ref: "CacheHeaders" },
              },
            },
          },
        },
      },
      Outputs: {
        DistributionDomainName: {
          Value: { "Fn::GetAtt": ["SiteDistribution", "DomainName"] },
        },
      },
    },
  });

  await stack.waitForDeployComplete();

  await simAws.s3().putObject(
    new PutObjectCommand({
      Bucket: "site-bucket",
      Key: "index.html",
      ContentType: "text/html",
      Body: "<h1>Home</h1>",
    }),
  );

  const domainName = stack.output("DistributionDomainName");
  const response = await fetch(srv.localUrl(`http://${domainName}/`));

  console.log(response.headers.get("cache-control"));
} finally {
  await srv.close();
}

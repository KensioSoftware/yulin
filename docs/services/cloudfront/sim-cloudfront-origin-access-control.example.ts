/**
 * Serving a private S3 Bucket through an origin access control.
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
          Properties: {
            DistributionConfig: {
              Enabled: true,
              DefaultRootObject: "index.html",
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
        // Nothing but this Distribution may read the Bucket, which is what the
        // condition on the Distribution's ARN says.
        SiteBucketPolicy: {
          Type: "AWS::S3::BucketPolicy",
          Properties: {
            Bucket: { Ref: "SiteBucket" },
            PolicyDocument: {
              Version: "2012-10-17",
              Statement: [
                {
                  Effect: "Allow",
                  Principal: { Service: "cloudfront.amazonaws.com" },
                  Action: "s3:GetObject",
                  Resource: "arn:aws:s3:::site-bucket/*",
                  Condition: {
                    StringEquals: {
                      "AWS:SourceArn": {
                        "Fn::Join": [
                          "",
                          [
                            "arn:aws:cloudfront::",
                            { Ref: "AWS::AccountId" },
                            ":distribution/",
                            { Ref: "SiteDistribution" },
                          ],
                        ],
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      },
      Outputs: {
        SiteHostname: {
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

  const siteHostname = stack.output("SiteHostname");
  const home = await fetch(srv.localUrl(`http://${siteHostname}/`));

  console.log(await home.text()); // <h1>Home</h1>
} finally {
  await srv.close();
}

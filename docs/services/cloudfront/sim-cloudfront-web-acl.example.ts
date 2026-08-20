/**
 * Blocking a request to a Distribution with a web ACL.
 */

import { CreateDistributionCommand } from "@aws-sdk/client-cloudfront";
import {
  CreateBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { CreateWebACLCommand } from "@aws-sdk/client-wafv2";

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws });

try {
  const simS3 = simAws.s3();
  await simS3.createBucket(new CreateBucketCommand({ Bucket: "site-bucket" }));
  await simS3.putBucketPolicy(
    new PutBucketPolicyCommand({
      Bucket: "site-bucket",
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:GetObject",
          Resource: "arn:aws:s3:::site-bucket/*",
        },
      }),
    }),
  );
  await simS3.putObject(
    new PutObjectCommand({
      Bucket: "site-bucket",
      Key: "admin/users.html",
      ContentType: "text/html",
      Body: "<h1>Users</h1>",
    }),
  );

  // A CLOUDFRONT scope web ACL lives in us-east-1, wherever the Distribution
  // was created from.
  const acl = await simAws
    .accountRegionScope(simAws.defaultAccountId, "us-east-1")
    .wafV2()
    .createWebAcl(
      new CreateWebACLCommand({
        Name: "site-acl",
        Scope: "CLOUDFRONT",
        DefaultAction: { Allow: {} },
        VisibilityConfig: {
          SampledRequestsEnabled: false,
          CloudWatchMetricsEnabled: false,
          MetricName: "site",
        },
        Rules: [
          {
            Name: "block-admin",
            Priority: 0,
            Action: { Block: {} },
            Statement: {
              ByteMatchStatement: {
                FieldToMatch: { UriPath: {} },
                PositionalConstraint: "STARTS_WITH",
                SearchString: Buffer.from("/admin"),
                TextTransformations: [{ Priority: 0, Type: "LOWERCASE" }],
              },
            },
            VisibilityConfig: {
              SampledRequestsEnabled: false,
              CloudWatchMetricsEnabled: false,
              MetricName: "block-admin",
            },
          },
        ],
      }),
    );

  const creation = await simAws.cloudFront().createDistribution(
    new CreateDistributionCommand({
      DistributionConfig: {
        CallerReference: "guarded-site",
        Comment: "Site behind a web ACL",
        Enabled: true,
        WebACLId: acl.Summary!.ARN,
        Origins: {
          Quantity: 1,
          Items: [
            {
              Id: "site-origin",
              DomainName: "site-bucket.s3.amazonaws.com",
              S3OriginConfig: { OriginAccessIdentity: "" },
            },
          ],
        },
        DefaultCacheBehavior: {
          TargetOriginId: "site-origin",
          ViewerProtocolPolicy: "allow-all",
        },
      },
    }),
  );

  const distroHostname = creation.Distribution!.DomainName!;

  const blocked = await fetch(
    srv.localUrl(`http://${distroHostname}/admin/users.html`),
  );
  console.log(blocked.status); // 403

  // The Bucket still holds the page. The request never got as far as the
  // Origin to ask for it.
} finally {
  await srv.close();
}

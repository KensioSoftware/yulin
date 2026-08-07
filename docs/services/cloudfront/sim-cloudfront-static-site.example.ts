/**
 * Serving a static site with a default root object and a custom error page.
 */

import { CreateDistributionCommand } from "@aws-sdk/client-cloudfront";
import {
  CreateBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  PutPublicAccessBlockCommand,
} from "@aws-sdk/client-s3";

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws });

try {
  const simS3 = simAws.s3();

  await simS3.createBucket(new CreateBucketCommand({ Bucket: "site-bucket" }));

  // A CloudFront S3 Origin with no origin access control reads the Bucket
  // anonymously, so what it serves has to be publicly readable.
  await simS3.putPublicAccessBlock(
    new PutPublicAccessBlockCommand({
      Bucket: "site-bucket",
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        IgnorePublicAcls: true,
      },
    }),
  );
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

  const pages = {
    "index.html": "<h1>Home</h1>",
    "404.html": "<h1>Page not found</h1>",
  };

  for (const [key, body] of Object.entries(pages)) {
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "site-bucket",
        Key: key,
        ContentType: "text/html",
        Body: body,
      }),
    );
  }

  const distributionCreation = await simAws.cloudFront().createDistribution(
    new CreateDistributionCommand({
      DistributionConfig: {
        CallerReference: "static-site",
        Comment: "Static site",
        Enabled: true,
        DefaultRootObject: "index.html",
        CustomErrorResponses: {
          Quantity: 2,
          Items: [
            {
              ErrorCode: 404,
              ResponsePagePath: "/404.html",
              ResponseCode: "404",
            },
            {
              ErrorCode: 403,
              ResponsePagePath: "/404.html",
              ResponseCode: "404",
            },
          ],
        },
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

  const distroHostname = distributionCreation.Distribution!.DomainName!;

  const home = await fetch(srv.localUrl(`http://${distroHostname}/`));
  console.log(await home.text()); // <h1>Home</h1>

  const missing = await fetch(srv.localUrl(`http://${distroHostname}/nowhere`));
  console.log(missing.status); // 404
  console.log(await missing.text()); // <h1>Page not found</h1>
} finally {
  await srv.close();
}

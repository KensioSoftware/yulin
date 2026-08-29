/**
 * Expiring a cached object by moving simulated time past its cache control.
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

  await simS3.createBucket(new CreateBucketCommand({ Bucket: "news-bucket" }));
  await simS3.putPublicAccessBlock(
    new PutPublicAccessBlockCommand({
      Bucket: "news-bucket",
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        IgnorePublicAcls: true,
      },
    }),
  );
  await simS3.putBucketPolicy(
    new PutBucketPolicyCommand({
      Bucket: "news-bucket",
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:GetObject",
          Resource: "arn:aws:s3:::news-bucket/*",
        },
      }),
    }),
  );

  // The Origin holds each version of the page for a minute.
  const publish = async (body: string): Promise<void> => {
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "news-bucket",
        Key: "index.html",
        ContentType: "text/html",
        CacheControl: "max-age=60",
        Body: body,
      }),
    );
  };

  await publish("<h1>First</h1>");

  const distributionCreation = await simAws.cloudFront().createDistribution(
    new CreateDistributionCommand({
      DistributionConfig: {
        CallerReference: "news-site",
        Comment: "News site",
        Enabled: true,
        DefaultRootObject: "index.html",
        Origins: {
          Quantity: 1,
          Items: [
            {
              Id: "news-origin",
              DomainName: "news-bucket.s3.amazonaws.com",
              S3OriginConfig: { OriginAccessIdentity: "" },
            },
          ],
        },
        DefaultCacheBehavior: {
          TargetOriginId: "news-origin",
          ViewerProtocolPolicy: "allow-all",
          // CachingOptimized, one of CloudFront's managed policies.
          CachePolicyId: "658327ea-f89d-4fab-a63d-7e88639e58f6",
        },
      },
    }),
  );

  const distroHostname = distributionCreation.Distribution!.DomainName!;
  const home = srv.localUrl(`http://${distroHostname}/`);

  const first = await fetch(home);
  console.log(await first.text()); // <h1>First</h1>

  await publish("<h1>Second</h1>");

  // Still inside the minute the Origin asked for.
  const held = await fetch(home);
  console.log(await held.text()); // <h1>First</h1>

  // Simulated time moves past it, and the next request reaches the Origin.
  await simAws.clock().advanceBy({ seconds: 61 });

  const expired = await fetch(home);
  console.log(await expired.text()); // <h1>Second</h1>
} finally {
  await srv.close();
}

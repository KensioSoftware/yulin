/**
 * Serving a request from a Distribution's cache, and missing it at another
 * edge.
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

  const publish = async (body: string): Promise<void> => {
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "site-bucket",
        Key: "index.html",
        ContentType: "text/html",
        Body: body,
      }),
    );
  };

  await publish("<h1>First</h1>");

  const distributionCreation = await simAws.cloudFront().createDistribution(
    new CreateDistributionCommand({
      DistributionConfig: {
        CallerReference: "cached-site",
        Comment: "Cached site",
        Enabled: true,
        DefaultRootObject: "index.html",
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
          // CachingOptimized, one of CloudFront's managed policies.
          CachePolicyId: "658327ea-f89d-4fab-a63d-7e88639e58f6",
        },
      },
    }),
  );

  const distroHostname = distributionCreation.Distribution!.DomainName!;
  const home = srv.localUrl(`http://${distroHostname}/`);

  const first = await fetch(home);
  console.log(first.headers.get("x-cache")); // Miss from cloudfront
  console.log(await first.text()); // <h1>First</h1>

  // The Bucket holds a new page, which the Distribution has not been told
  // about.
  await publish("<h1>Second</h1>");

  const second = await fetch(home);
  console.log(second.headers.get("x-cache")); // Hit from cloudfront
  console.log(await second.text()); // <h1>First</h1>

  // The entry goes on ageing while simulated time moves.
  await simAws.clock().advanceBy({ seconds: 30 });

  const aged = await fetch(home);
  console.log(aged.headers.get("age")); // 30

  // Another point of presence has nothing cached under that key.
  const coldEdge = await fetch(home, {
    headers: { "x-sim-aws-cloudfront-edge": "second-edge" },
  });
  console.log(await coldEdge.text()); // <h1>Second</h1>

  // With caching off, every request reaches the Origin.
  simAws.cloudFront().configureCaching({ enabled: false });

  const uncached = await fetch(home);
  console.log(await uncached.text()); // <h1>Second</h1>
} finally {
  await srv.close();
}

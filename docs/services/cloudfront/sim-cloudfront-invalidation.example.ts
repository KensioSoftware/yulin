/**
 * Clearing what a Distribution has cached, and reading the invalidation back.
 */

import {
  CreateDistributionCommand,
  CreateInvalidationCommand,
  GetInvalidationCommand,
  ListInvalidationsCommand,
} from "@aws-sdk/client-cloudfront";
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

  await simS3.createBucket(
    new CreateBucketCommand({ Bucket: "release-bucket" }),
  );
  await simS3.putPublicAccessBlock(
    new PutPublicAccessBlockCommand({
      Bucket: "release-bucket",
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        IgnorePublicAcls: true,
      },
    }),
  );
  await simS3.putBucketPolicy(
    new PutBucketPolicyCommand({
      Bucket: "release-bucket",
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:GetObject",
          Resource: "arn:aws:s3:::release-bucket/*",
        },
      }),
    }),
  );

  const publish = async (body: string): Promise<void> => {
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "release-bucket",
        Key: "index.html",
        ContentType: "text/html",
        Body: body,
      }),
    );
  };

  await publish("<h1>First</h1>");

  const simCloudFront = simAws.cloudFront();
  const distributionCreation = await simCloudFront.createDistribution(
    new CreateDistributionCommand({
      DistributionConfig: {
        CallerReference: "released-site",
        Comment: "Released site",
        Enabled: true,
        DefaultRootObject: "index.html",
        Origins: {
          Quantity: 1,
          Items: [
            {
              Id: "site-origin",
              DomainName: "release-bucket.s3.amazonaws.com",
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

  const distributionId = distributionCreation.Distribution!.Id!;
  const distroHostname = distributionCreation.Distribution!.DomainName!;
  const home = srv.localUrl(`http://${distroHostname}/`);

  const first = await fetch(home);
  console.log(await first.text()); // <h1>First</h1>

  // The deploy publishes a new page, which the Distribution is still holding
  // the old version of.
  await publish("<h1>Second</h1>");

  const stale = await fetch(home);
  console.log(await stale.text()); // <h1>First</h1>

  const creation = await simCloudFront.createInvalidation(
    new CreateInvalidationCommand({
      DistributionId: distributionId,
      InvalidationBatch: {
        CallerReference: "deployment-1",
        Paths: { Quantity: 1, Items: ["/*"] },
      },
    }),
  );

  console.log(creation.Invalidation!.Status); // InProgress

  const released = await fetch(home);
  console.log(await released.text()); // <h1>Second</h1>

  // The invalidation finishes on the background scheduler.
  await simAws.backgroundTasksComplete();

  const invalidation = await simCloudFront.getInvalidation(
    new GetInvalidationCommand({
      DistributionId: distributionId,
      Id: creation.Invalidation!.Id,
    }),
  );

  console.log(invalidation.Invalidation!.Status); // Completed

  const listing = await simCloudFront.listInvalidations(
    new ListInvalidationsCommand({ DistributionId: distributionId }),
  );

  console.log(listing.InvalidationList!.Quantity); // 1
} finally {
  await srv.close();
}

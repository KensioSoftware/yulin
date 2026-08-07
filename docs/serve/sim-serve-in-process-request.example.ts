/**
 * Requesting a simulated S3 website with no server listening.
 */

import {
  CreateBucketCommand,
  PutBucketPolicyCommand,
  PutBucketWebsiteCommand,
  PutObjectCommand,
  PutPublicAccessBlockCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";
import { SimAwsHttp } from "@kensio/yulin/serve";

const simAws = new SimAws();
const simAwsHttp = new SimAwsHttp({ simAws });
const simS3 = simAws.region("eu-west-2").s3();

await simS3.createBucket(new CreateBucketCommand({ Bucket: "foo-site" }));
await simS3.putObject(
  new PutObjectCommand({
    Bucket: "foo-site",
    Key: "index.html",
    Body: "<h1>Hello, world!</h1>",
    ContentType: "text/html; charset=utf-8",
  }),
);
await simS3.putBucketWebsite(
  new PutBucketWebsiteCommand({
    Bucket: "foo-site",
    WebsiteConfiguration: {
      IndexDocument: {
        Suffix: "index.html",
      },
    },
  }),
);

// A website endpoint serves only what the Bucket policy makes readable, and a
// public policy needs the Block Public Access opt-out first.
await simS3.putPublicAccessBlock(
  new PutPublicAccessBlockCommand({
    Bucket: "foo-site",
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      IgnorePublicAcls: true,
    },
  }),
);
await simS3.putBucketPolicy(
  new PutBucketPolicyCommand({
    Bucket: "foo-site",
    Policy: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: "*",
        Action: "s3:GetObject",
        Resource: "arn:aws:s3:::foo-site/*",
      },
    }),
  }),
);

const response = await simAwsHttp.fetch(simS3.getBucketWebsiteUrl("foo-site"));

console.log(response.status); // 200
console.log(await response.text()); // <h1>Hello, world!</h1>

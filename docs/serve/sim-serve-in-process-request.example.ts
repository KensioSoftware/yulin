/**
 * Requesting a simulated S3 website without starting a server.
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
const http = new SimAwsHttp({ simAws });
const s3 = simAws.region("eu-west-2").s3();

await s3.createBucket(new CreateBucketCommand({ Bucket: "site" }));
await s3.putObject(
  new PutObjectCommand({
    Bucket: "site",
    Key: "index.html",
    Body: "<h1>Hello</h1>",
    ContentType: "text/html; charset=utf-8",
  }),
);
await s3.putBucketWebsite(
  new PutBucketWebsiteCommand({
    Bucket: "site",
    WebsiteConfiguration: { IndexDocument: { Suffix: "index.html" } },
  }),
);
await s3.putPublicAccessBlock(
  new PutPublicAccessBlockCommand({
    Bucket: "site",
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      IgnorePublicAcls: true,
    },
  }),
);
await s3.putBucketPolicy(
  new PutBucketPolicyCommand({
    Bucket: "site",
    Policy: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: "*",
        Action: "s3:GetObject",
        Resource: "arn:aws:s3:::site/*",
      },
    }),
  }),
);

const response = await http.fetch(s3.getBucketWebsiteUrl("site"));

console.log(response.status); // 200
console.log(await response.text()); // <h1>Hello</h1>

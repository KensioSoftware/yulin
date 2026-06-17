/**
 * Simulated S3 static website hosting.
 */

import {
  CreateBucketCommand,
  PutBucketWebsiteCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.region("eu-west-2").s3();

await simS3.createBucket(
  new CreateBucketCommand({
    Bucket: "foo-site",
  }),
);

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "foo-site",
    Key: "index.html",
    Body: "<h1>Hello from simulated S3</h1>",
    ContentType: "text/html; charset=utf-8",
  }),
);

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "foo-site",
    Key: "docs/index.html",
    Body: "<h1>Docs</h1>",
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

console.log(simS3.getBucketWebsiteUrl("foo-site").toString());

/**
 * Listing Objects in a simulated S3 Bucket.
 */

import {
  CreateBucketCommand,
  ListObjectsCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

await simS3.createBucket(
  new CreateBucketCommand({
    Bucket: "assets-bucket",
  }),
);

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "assets-bucket",
    Key: "images/logo.svg",
    Body: "<svg></svg>",
    ContentType: "image/svg+xml",
  }),
);

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "assets-bucket",
    Key: "docs/index.html",
    Body: "<h1>Docs</h1>",
    ContentType: "text/html; charset=utf-8",
  }),
);

const listObjectsOutput = await simS3.listObjects(
  new ListObjectsCommand({
    Bucket: "assets-bucket",
    Prefix: "docs/",
    MaxKeys: 10,
  }),
);

const objectContentItems = listObjectsOutput.Contents ?? [];
for (const object of objectContentItems) {
  console.log(object.Key, object.Size);
}

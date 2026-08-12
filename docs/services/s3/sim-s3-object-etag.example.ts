/**
 * Comparing a local file against a simulated S3 Object by content hash.
 */

import { createHash } from "node:crypto";
import {
  CreateBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

await simS3.createBucket(new CreateBucketCommand({ Bucket: "site-bucket" }));

const published = "<h1>Hello</h1>";
await simS3.putObject(
  new PutObjectCommand({
    Bucket: "site-bucket",
    Key: "index.html",
    Body: published,
  }),
);

const listOutput = await simS3.listObjectsV2(
  new ListObjectsV2Command({ Bucket: "site-bucket" }),
);

const localFile = Buffer.from(published);
const localETag = `"${createHash("md5").update(localFile).digest("hex")}"`;

const listedObjects = listOutput.Contents ?? [];
for (const object of listedObjects) {
  // Nothing to upload: the Bucket already holds these bytes.
  console.log(object.Key, object.ETag === localETag);
}

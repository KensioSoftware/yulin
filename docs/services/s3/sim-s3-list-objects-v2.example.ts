/**
 * Listing Objects in a simulated S3 Bucket.
 */

import {
  CreateBucketCommand,
  ListObjectsV2Command,
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

for (const key of ["docs/index.html", "docs/guide.html", "images/logo.svg"]) {
  await simS3.putObject(
    new PutObjectCommand({
      Bucket: "assets-bucket",
      Key: key,
      Body: "file contents",
    }),
  );
}

const listOutput = await simS3.listObjectsV2(
  new ListObjectsV2Command({
    Bucket: "assets-bucket",
    Prefix: "docs/",
  }),
);

console.log(listOutput.KeyCount);

const listedObjects = listOutput.Contents ?? [];
for (const object of listedObjects) {
  console.log(object.Key, object.Size, object.ETag, object.LastModified);
}

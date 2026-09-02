/**
 * Listing a simulated S3 Bucket with its keys encoded.
 */

import {
  CreateBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simS3 = new SimAws().s3();

await simS3.createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "uploads",
    Key: "invoices/March 2027 & April.pdf",
    Body: "invoice bytes",
  }),
);

const listed = await simS3.listObjectsV2(
  new ListObjectsV2Command({ Bucket: "uploads", EncodingType: "url" }),
);

console.log(listed.EncodingType); // url

const listedObjects = listed.Contents ?? [];

for (const listedObject of listedObjects) {
  const encodedKey = listedObject.Key ?? "";

  console.log(encodedKey); // invoices/March+2027+%26+April.pdf

  // S3 form-encodes a key, and a plus sign in one stands for a space.
  console.log(decodeURIComponent(encodedKey.replaceAll("+", " ")));
}

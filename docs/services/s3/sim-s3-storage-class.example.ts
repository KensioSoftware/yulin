/**
 * Writing a simulated S3 Object into an archival storage class.
 */

import {
  CreateBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.region("eu-west-2").s3();

await simS3.createBucket(new CreateBucketCommand({ Bucket: "archive" }));

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "archive",
    Key: "ledgers/2026.csv",
    Body: "a,b",
    StorageClass: "GLACIER",
  }),
);

const listing = await simS3.listObjectsV2(
  new ListObjectsV2Command({ Bucket: "archive" }),
);
const head = await simS3.headObject(
  new HeadObjectCommand({ Bucket: "archive", Key: "ledgers/2026.csv" }),
);

// GLACIER, from the listing and from the Object itself.
console.log(listing.Contents?.[0]?.StorageClass, head.StorageClass);

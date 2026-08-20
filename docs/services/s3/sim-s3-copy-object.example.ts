/**
 * Copying an Object between simulated S3 Buckets.
 */

import {
  CopyObjectCommand,
  CreateBucketCommand,
  DeleteObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

await simS3.createBucket(new CreateBucketCommand({ Bucket: "inbox-bucket" }));
await simS3.createBucket(new CreateBucketCommand({ Bucket: "archive-bucket" }));

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "inbox-bucket",
    Key: "report.pdf",
    Body: "quarterly figures",
    ContentType: "application/pdf",
  }),
);

const copy = await simS3.copyObject(
  new CopyObjectCommand({
    Bucket: "archive-bucket",
    Key: "2026/report.pdf",
    CopySource: "inbox-bucket/report.pdf",
  }),
);

console.log(copy.CopyObjectResult?.ETag);
console.log(copy.CopyObjectResult?.LastModified);

// The copy carries the source's content type, because MetadataDirective
// defaults to COPY. Deleting the source turns the copy into a move.
await simS3.deleteObject(
  new DeleteObjectCommand({ Bucket: "inbox-bucket", Key: "report.pdf" }),
);

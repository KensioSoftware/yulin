/**
 * Deleting Objects from a simulated S3 Bucket.
 */

import {
  CreateBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

await simS3.createBucket(
  new CreateBucketCommand({
    Bucket: "uploads-bucket",
  }),
);

for (const key of ["receipt.pdf", "invoice.pdf", "notes.txt"]) {
  await simS3.putObject(
    new PutObjectCommand({
      Bucket: "uploads-bucket",
      Key: key,
      Body: "file contents",
    }),
  );
}

await simS3.deleteObject(
  new DeleteObjectCommand({
    Bucket: "uploads-bucket",
    Key: "receipt.pdf",
  }),
);

const batchOutput = await simS3.deleteObjects(
  new DeleteObjectsCommand({
    Bucket: "uploads-bucket",
    Delete: {
      Objects: [{ Key: "invoice.pdf" }, { Key: "notes.txt" }],
    },
  }),
);

const removedObjects = batchOutput.Deleted ?? [];
for (const removed of removedObjects) {
  console.log(removed.Key);
}

const refusedObjects = batchOutput.Errors ?? [];
for (const refused of refusedObjects) {
  console.log(refused.Key, refused.Code);
}

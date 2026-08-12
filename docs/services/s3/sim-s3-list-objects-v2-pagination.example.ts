/**
 * Walking a truncated Object listing in a simulated S3 Bucket.
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
    Bucket: "paged-bucket",
  }),
);

for (const key of ["a.txt", "b.txt", "c.txt"]) {
  await simS3.putObject(
    new PutObjectCommand({ Bucket: "paged-bucket", Key: key, Body: key }),
  );
}

// Ask for a page of one, so the listing has to be continued.
let continuationToken: string | undefined;
const allKeys: string[] = [];

do {
  const page = await simS3.listObjectsV2(
    new ListObjectsV2Command({
      Bucket: "paged-bucket",
      MaxKeys: 1,
      ContinuationToken: continuationToken,
    }),
  );

  const pageObjects = page.Contents ?? [];
  for (const object of pageObjects) {
    allKeys.push(object.Key ?? "");
  }

  continuationToken = page.NextContinuationToken;
} while (continuationToken !== undefined);

console.log(allKeys);

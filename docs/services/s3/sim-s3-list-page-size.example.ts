/**
 * Lowering the page size of a simulated S3 listing, so a caller that does not
 * set MaxKeys still has to continue one.
 */

import {
  CreateBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();
simS3.configureMaxKeysPerPage(1);

await simS3.createBucket(new CreateBucketCommand({ Bucket: "small-pages" }));

for (const key of ["a.txt", "b.txt"]) {
  await simS3.putObject(
    new PutObjectCommand({ Bucket: "small-pages", Key: key, Body: key }),
  );
}

const firstPage = await simS3.listObjectsV2(
  new ListObjectsV2Command({ Bucket: "small-pages" }),
);

console.log(firstPage.IsTruncated, firstPage.KeyCount);

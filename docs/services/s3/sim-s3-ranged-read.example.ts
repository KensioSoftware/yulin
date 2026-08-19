/**
 * Reading part of a simulated S3 Object.
 */

import {
  CreateBucketCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

await simS3.createBucket(new CreateBucketCommand({ Bucket: "reports-bucket" }));

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "reports-bucket",
    Key: "quarter.csv",
    Body: "region,revenue\neu-west-2,1200\n",
  }),
);

const header = await simS3.getObject(
  new GetObjectCommand({
    Bucket: "reports-bucket",
    Key: "quarter.csv",
    Range: "bytes=0-13",
  }),
);

// The first fourteen bytes, which are "region,revenue".
console.log(header.Body);
// 14
console.log(header.ContentLength);
// "bytes 0-13/30"
console.log(header.ContentRange);

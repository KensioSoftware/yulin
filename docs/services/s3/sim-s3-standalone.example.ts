/**
 * Standalone simulated S3 instance.
 */

import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { SimS3 } from "@kensio/yulin/s3";

const simS3 = new SimS3();

await simS3.createBucket(
  new CreateBucketCommand({
    Bucket: "standalone-bucket",
  }),
);

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "standalone-bucket",
    Key: "hello.txt",
    Body: "Hello from standalone SimS3",
  }),
);

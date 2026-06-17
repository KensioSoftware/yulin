/**
 * Simulated S3 Account and Region scoping.
 */

import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const defaultS3 = simAws.s3();
const euWest2S3 = simAws.region("eu-west-2").s3();
const accountS3 = simAws.account("111111111111").s3();
const scopedS3 = simAws.account("222222222222").region("ap-east-1").s3();

await defaultS3.createBucket(
  new CreateBucketCommand({
    Bucket: "default-bucket",
  }),
);

await euWest2S3.createBucket(
  new CreateBucketCommand({
    Bucket: "eu-west-2-bucket",
  }),
);

await accountS3.createBucket(
  new CreateBucketCommand({
    Bucket: "account-bucket",
  }),
);

await scopedS3.createBucket(
  new CreateBucketCommand({
    Bucket: "scoped-bucket",
  }),
);

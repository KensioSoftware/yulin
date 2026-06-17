/**
 * Listing Buckets in simulated S3.
 */

import { CreateBucketCommand, ListBucketsCommand } from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

await simS3.createBucket(
  new CreateBucketCommand({
    Bucket: "foo-bucket",
  }),
);

const listBucketsOutput = await simS3.listBuckets(new ListBucketsCommand());

console.log(listBucketsOutput.Buckets?.map((bucket) => bucket.Name));

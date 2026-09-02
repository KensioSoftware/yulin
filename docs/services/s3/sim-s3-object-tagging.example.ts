/**
 * Tagging a simulated S3 Object and reading the tags back.
 */

import {
  CreateBucketCommand,
  GetObjectTaggingCommand,
  PutObjectCommand,
  PutObjectTaggingCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.region("eu-west-2").s3();

await simS3.createBucket(new CreateBucketCommand({ Bucket: "reports" }));

// A write can carry its own tags, as the query string S3 takes them in.
await simS3.putObject(
  new PutObjectCommand({
    Bucket: "reports",
    Key: "quarterly.csv",
    Body: "period,total",
    Tagging: "department=finance&retention=long",
  }),
);

// A tagging request replaces the whole set.
await simS3.putObjectTagging(
  new PutObjectTaggingCommand({
    Bucket: "reports",
    Key: "quarterly.csv",
    Tagging: { TagSet: [{ Key: "department", Value: "legal" }] },
  }),
);

const read = await simS3.getObjectTagging(
  new GetObjectTaggingCommand({ Bucket: "reports", Key: "quarterly.csv" }),
);

// [ { Key: "department", Value: "legal" } ]
console.log(read.TagSet);

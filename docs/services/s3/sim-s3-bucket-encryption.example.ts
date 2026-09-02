/**
 * Configuring a simulated S3 Bucket's default encryption.
 */

import {
  CreateBucketCommand,
  GetBucketEncryptionCommand,
  GetObjectCommand,
  PutBucketEncryptionCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.region("eu-west-2").s3();

await simS3.createBucket(new CreateBucketCommand({ Bucket: "documents" }));

await simS3.putBucketEncryption(
  new PutBucketEncryptionCommand({
    Bucket: "documents",
    ServerSideEncryptionConfiguration: {
      Rules: [
        { ApplyServerSideEncryptionByDefault: { SSEAlgorithm: "aws:kms" } },
      ],
    },
  }),
);

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "documents",
    Key: "contracts/one.pdf",
    Body: "one",
  }),
);

const configured = await simS3.getBucketEncryption(
  new GetBucketEncryptionCommand({ Bucket: "documents" }),
);
const read = await simS3.getObject(
  new GetObjectCommand({ Bucket: "documents", Key: "contracts/one.pdf" }),
);

// aws:kms, from the Bucket's configuration and from the Object it stamped.
console.log(
  configured.ServerSideEncryptionConfiguration?.Rules?.[0]
    ?.ApplyServerSideEncryptionByDefault?.SSEAlgorithm,
  read.ServerSideEncryption,
);

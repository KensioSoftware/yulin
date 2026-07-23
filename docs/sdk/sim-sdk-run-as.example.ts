/**
 * Attributing intercepted SDK Commands to a caller with runAs.
 */

import {
  CreateBucketCommand,
  ListBucketsCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";
import { SimSdk } from "@kensio/yulin/sdk";

const simAws = new SimAws();
const simSdk = new SimSdk({ simAws });

// Seed a Bucket in a specific simulated Account.
await simAws
  .account("222222222222")
  .s3()
  .createBucket(new CreateBucketCommand({ Bucket: "team-bucket" }));

const s3Client = new S3Client({ region: "us-east-1" });
simSdk.intercept(s3Client);

await simAws.runAs(
  { kind: "arn", arn: "arn:aws:iam::222222222222:role/TeamRole" },
  async () => {
    // Sent as the TeamRole caller, so resolved in Account 222222222222.
    const output = await s3Client.send(new ListBucketsCommand({}));
    console.log(output.Buckets); // [{ Name: "team-bucket" }]
  },
);

simSdk.restoreAll();

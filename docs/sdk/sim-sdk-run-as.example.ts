/**
 * Attributing intercepted SDK Commands to a caller with runAs.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateBucketCommand,
  ListBucketsCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";
import { SimSdk } from "@kensio/yulin/sdk";

const simAws = new SimAws();
const simSdk = new SimSdk({ simAws });

// Seed a Bucket, and a Role allowed to list Buckets, in a simulated Account.
const account = simAws.account("222222222222");
await account
  .s3()
  .createBucket(new CreateBucketCommand({ Bucket: "team-bucket" }));
await account.iam().createRole(
  new CreateRoleCommand({
    RoleName: "TeamRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: "arn:aws:iam::222222222222:root" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);
await account.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "TeamRole",
    PolicyName: "list-buckets",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "s3:ListAllMyBuckets",
        Resource: "*",
      },
    }),
  }),
);

const s3Client = new S3Client({ region: "us-east-1" });
simSdk.intercept(s3Client);

await simAws.runAs(
  { kind: "arn", arn: "arn:aws:iam::222222222222:role/TeamRole" },
  async () => {
    // Sent as the TeamRole caller: resolved in Account 222222222222 and
    // authorized against the Role's simulated IAM permissions.
    const output = await s3Client.send(new ListBucketsCommand({}));
    console.log(output.Buckets); // [{ Name: "team-bucket" }]
  },
);

simSdk.restoreAll();

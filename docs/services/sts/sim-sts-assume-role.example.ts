/**
 * Assuming a simulated IAM Role through simulated STS.
 */

import { CreateRoleCommand } from "@aws-sdk/client-iam";
import { AssumeRoleCommand } from "@aws-sdk/client-sts";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const account = simAws.account("123456789012");

await account.iam().createRole(
  new CreateRoleCommand({
    RoleName: "TargetRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: "arn:aws:iam::123456789012:root" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

const assumeRoleOutput = await account.sts().assumeRole(
  new AssumeRoleCommand({
    RoleArn: "arn:aws:iam::123456789012:role/TargetRole",
    RoleSessionName: "test-session",
  }),
);

console.log(assumeRoleOutput.AssumedRoleUser?.Arn);
console.log(assumeRoleOutput.Credentials?.AccessKeyId);
console.log(assumeRoleOutput.Credentials?.Expiration);

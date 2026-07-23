/**
 * One simulated IAM Role assuming another through simulated STS.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { AssumeRoleCommand } from "@aws-sdk/client-sts";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const account = simAws.account("123456789012");
const simIam = account.iam();

const sourceRoleArn = "arn:aws:iam::123456789012:role/SourceRole";
const targetRoleArn = "arn:aws:iam::123456789012:role/TargetRole";

await simIam.createRole(
  new CreateRoleCommand({
    RoleName: "SourceRole",
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

await simIam.putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "SourceRole",
    PolicyName: "AssumeTargetRole",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "sts:AssumeRole",
        Resource: targetRoleArn,
      },
    }),
  }),
);

await simIam.createRole(
  new CreateRoleCommand({
    RoleName: "TargetRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: sourceRoleArn },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

const assumeRoleOutput = await account.sts().assumeRole(
  new AssumeRoleCommand({
    RoleArn: targetRoleArn,
    RoleSessionName: "role-session",
  }),
  {
    caller: { kind: "arn", arn: sourceRoleArn },
  },
);

console.log(assumeRoleOutput.AssumedRoleUser?.Arn);

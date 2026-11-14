/**
 * Capping a simulated Role session with an inline session policy.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { AssumeRoleCommand } from "@aws-sdk/client-sts";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });

await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "DataRole",
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

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "DataRole",
    PolicyName: "S3ReadWrite",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: ["s3:GetObject", "s3:PutObject"],
        Resource: "*",
      },
    }),
  }),
);

const assumed = await simAws.sts().assumeRole(
  new AssumeRoleCommand({
    RoleArn: "arn:aws:iam::123456789012:role/DataRole",
    RoleSessionName: "read-only",
    Policy: JSON.stringify({
      Version: "2012-10-17",
      Statement: { Effect: "Allow", Action: "s3:GetObject", Resource: "*" },
    }),
  }),
);

const caller = {
  kind: "credentials" as const,
  credentials: {
    accessKeyId: assumed.Credentials!.AccessKeyId!,
    secretAccessKey: assumed.Credentials!.SecretAccessKey!,
    sessionToken: assumed.Credentials!.SessionToken!,
  },
};

const write = simAws.iam().authorize({
  action: "s3:PutObject",
  resource: "arn:aws:s3:::reports/q1.csv",
  caller,
});

console.log(write.isAllowed); // false
// because no session policy allows the s3:PutObject action
console.log(write.denialReason);

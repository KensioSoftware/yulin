/**
 * Reading a simulated SecureString under the aws/ssm managed key.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { GetParameterCommand, PutParameterCommand } from "@aws-sdk/client-ssm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const accountId = simAws.defaultAccountId;

await simAws.ssm().putParameter(
  new PutParameterCommand({
    Name: "/myapp/prod/db-password",
    Type: "SecureString",
    Value: "hunter2",
  }),
);

const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "ConfigReader",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: `arn:aws:iam::${accountId}:root` },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

// The parameter, and no KMS permission at all.
await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "ConfigReader",
    PolicyName: "ReadDbPassword",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "ssm:GetParameter",
        Resource: "*",
      },
    }),
  }),
);

const read = await simAws.ssm().getParameter(
  new GetParameterCommand({
    Name: "/myapp/prod/db-password",
    WithDecryption: true,
  }),
  { caller: { kind: "arn", arn: role.Role.Arn } },
);

console.log(read.Parameter?.Value); // "hunter2"

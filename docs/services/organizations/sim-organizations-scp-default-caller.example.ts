/**
 * Reading an account whose organization denies its root principal.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";

const administratorArn = "arn:aws:iam::123456789012:role/Administrator";

const simAws = new SimAws({
  defaultAccountId: "123456789012",
  defaultCaller: { kind: "arn", arn: administratorArn },
});

// The Role is created as the account root, because a simulation with a default
// caller attributes these two commands to a Role that has no policy yet.
const root = simAws.account().rootPrincipal;
const simIam = simAws.iam();

await simIam.createRole(
  new CreateRoleCommand({
    RoleName: "Administrator",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: "arn:aws:iam::123456789012:root" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
  { caller: root },
);

await simIam.putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "Administrator",
    PolicyName: "Administer",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: { Effect: "Allow", Action: "*", Resource: "*" },
    }),
  }),
  { caller: root },
);

simAws.organizations().attachServiceControlPolicy("123456789012", {
  Version: "2012-10-17",
  Statement: {
    Sid: "DenyRootPrincipal",
    Effect: "Deny",
    Action: "*",
    Resource: "*",
    Condition: { ArnLike: { "aws:PrincipalArn": "arn:aws:iam::*:root" } },
  },
});

await simAws.ssm().putParameter({
  input: { Name: "/reports/bucket", Type: "String", Value: "reports-bucket" },
});

const read = await simAws
  .ssm()
  .getParameter({ input: { Name: "/reports/bucket" } });

const identity = await simAws.sts().getCallerIdentity({});

console.log(read.Parameter?.Value); // "reports-bucket"
console.log(identity.Arn); // "arn:aws:iam::123456789012:role/Administrator"

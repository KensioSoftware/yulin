/**
 * A cross-Account request needs an allow from both Accounts.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const partnerRoleArn = "arn:aws:iam::222222222222:role/Reader";

// The Bucket's Account grants the partner Account's Role.
const bucketPolicy = {
  document: {
    Version: "2012-10-17",
    Statement: {
      Effect: "Allow",
      Principal: { AWS: partnerRoleArn },
      Action: "s3:GetObject",
      Resource: "arn:aws:s3:::reports-bucket/*",
    },
  },
} as const;

const request = {
  action: "s3:GetObject",
  resource: "arn:aws:s3:::reports-bucket/summary.csv",
  caller: { kind: "arn", arn: partnerRoleArn },
  resourcePolicies: [bucketPolicy],
} as const;

const beforeIdentityPolicy = simAws
  .account("111111111111")
  .iam()
  .authorize(request);

// false: the partner Account has not allowed its Role to read anything.
console.log(beforeIdentityPolicy.isAllowed);
console.log(beforeIdentityPolicy.resourceAllowStatements.length); // 1
console.log(beforeIdentityPolicy.identityAllowStatements.length); // 0

// The partner Account allows its own Role.
const partnerIam = simAws.account("222222222222").iam();

await partnerIam.createRole(
  new CreateRoleCommand({
    RoleName: "Reader",
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

await partnerIam.putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "Reader",
    PolicyName: "ReadReports",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "s3:GetObject",
        Resource: "arn:aws:s3:::reports-bucket/*",
      },
    }),
  }),
);

// true: both Accounts now allow the request.
console.log(simAws.account("111111111111").iam().authorize(request).isAllowed);

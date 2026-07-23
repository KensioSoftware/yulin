/**
 * Simulated IAM policy conditions.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simIam = simAws.account("123456789012").iam();

const createRoleOutput = await simIam.createRole(
  new CreateRoleCommand({
    RoleName: "FinanceReaderRole",
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
    RoleName: "FinanceReaderRole",
    PolicyName: "ReadFinanceObjects",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "s3:GetObject",
        Resource: "arn:aws:s3:::reports-bucket/*",
        Condition: {
          StringEquals: {
            "s3:ExistingObjectTag/department": "finance",
          },
        },
      },
    }),
  }),
);

const decision = simIam.authorize({
  action: "s3:GetObject",
  resource: "arn:aws:s3:::reports-bucket/2026/summary.csv",
  caller: { kind: "arn", arn: createRoleOutput.Role.Arn },
  conditionContext: {
    "s3:ExistingObjectTag/department": "finance",
  },
});

console.log(decision.isAllowed);

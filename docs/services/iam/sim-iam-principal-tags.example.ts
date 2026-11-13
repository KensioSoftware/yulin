/**
 * Granting access by the tags of the Role making the request.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });
const simIam = simAws.iam();

await simIam.createRole(
  new CreateRoleCommand({
    RoleName: "ReportsReader",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: "arn:aws:iam::123456789012:root" },
        Action: "sts:AssumeRole",
      },
    }),
    Tags: [{ Key: "team", Value: "reports" }],
  }),
);

await simIam.putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "ReportsReader",
    PolicyName: "ReadOwnTeamsObjects",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "s3:GetObject",
        Resource: "*",
        Condition: {
          StringEquals: {
            "s3:ExistingObjectTag/team": "reports",
            "aws:PrincipalTag/team": "reports",
          },
        },
      },
    }),
  }),
);

const decision = simIam.authorize({
  action: "s3:GetObject",
  resource: "arn:aws:s3:::reports-bucket/summary.csv",
  caller: {
    kind: "arn",
    arn: "arn:aws:iam::123456789012:role/ReportsReader",
  },
  conditionContext: { "s3:ExistingObjectTag/team": "reports" },
});

console.log(decision.isAllowed); // true

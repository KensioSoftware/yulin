/**
 * Requiring an ExternalId in a simulated Role trust policy.
 */

import { CreateRoleCommand } from "@aws-sdk/client-iam";
import { AssumeRoleCommand } from "@aws-sdk/client-sts";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const account = simAws.account("123456789012");

await account.iam().createRole(
  new CreateRoleCommand({
    RoleName: "PartnerRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: "arn:aws:iam::123456789012:root" },
        Action: "sts:AssumeRole",
        Condition: {
          StringEquals: {
            "sts:ExternalId": "expected-external-id",
          },
        },
      },
    }),
  }),
);

const assumeRoleOutput = await account.sts().assumeRole(
  new AssumeRoleCommand({
    RoleArn: "arn:aws:iam::123456789012:role/PartnerRole",
    RoleSessionName: "partner-session",
    ExternalId: "expected-external-id",
  }),
);

console.log(assumeRoleOutput.AssumedRoleUser?.Arn);

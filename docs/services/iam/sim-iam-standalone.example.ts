/**
 * Standalone simulated IAM instance.
 */

import { CreateRoleCommand } from "@aws-sdk/client-iam";
import { SimIam } from "@kensio/yulin/iam";

const simIam = new SimIam();

const roleCreation = await simIam.createRole(
  new CreateRoleCommand({
    RoleName: "StandaloneRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { Service: "lambda.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

console.log(roleCreation.Role.Arn);

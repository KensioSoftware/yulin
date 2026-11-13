/**
 * Attaching an AWS-managed policy to a simulated IAM Role.
 */

import {
  AttachRolePolicyCommand,
  CreateRoleCommand,
  GetPolicyVersionCommand,
  ListAttachedRolePoliciesCommand,
} from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";

const simIam = new SimAws().iam();

const roleCreation = await simIam.createRole(
  new CreateRoleCommand({
    RoleName: "OrdersHandler",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Service: "lambda.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      ],
    }),
  }),
);

const policyArn =
  "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole";

await simIam.attachRolePolicy(
  new AttachRolePolicyCommand({
    RoleName: "OrdersHandler",
    PolicyArn: policyArn,
  }),
);

const decision = simIam.authorize({
  action: "logs:PutLogEvents",
  resource:
    "arn:aws:logs:eu-west-2:123456789012:log-group:/aws/lambda/orders:*",
  caller: { kind: "arn", arn: roleCreation.Role.Arn },
});

const attached = await simIam.listAttachedRolePolicies(
  new ListAttachedRolePoliciesCommand({ RoleName: "OrdersHandler" }),
);

const version = await simIam.getPolicyVersion(
  new GetPolicyVersionCommand({ PolicyArn: policyArn, VersionId: "v1" }),
);

console.log(decision.isAllowed);
console.log(attached.AttachedPolicies.map((policy) => policy.PolicyName));
console.log(decodeURIComponent(version.PolicyVersion.Document ?? ""));

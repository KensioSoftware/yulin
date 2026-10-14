import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import type { SimAws } from "../../src/service/aws/sim-aws.js";
import { simIamPolicyDocumentFactory } from "../../src/service/iam/policy/sim-iam-policy-document.factory.js";

/**
 * What an execution Role is created to be allowed, which is the one thing the
 * test's handler does and nothing else.
 */
export interface ExecutionRoleInput {
  readonly roleName: string;
  readonly action: string;
  readonly resource: string;
}

/**
 * Create an execution role allowed one action, so what the handler does is
 * authorized as the role rather than as anything ambient.
 */
export async function executionRoleArn(
  simAws: SimAws,
  role: ExecutionRoleInput,
): Promise<string> {
  const creation = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: role.roleName,
      AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: {
          Principal: { Service: "lambda.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );
  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: role.roleName,
      PolicyName: `${role.roleName}Policy`,
      PolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: { Action: role.action, Resource: role.resource },
      }),
    }),
  );

  return creation.Role.Arn;
}

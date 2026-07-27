/**
 * Creates a simulated IAM Role with one inline policy statement.
 *
 * Cross-Account tests all need the caller's own half of the request: a Role in
 * the caller's Account whose identity policy allows the action. Every such test
 * was building the same Role and trust policy, so the setup lives here instead.
 *
 * This lives under `test/` for the same reasons as `test/sigv4/`: several test
 * files share it, and eslint rejects a test file that exports helpers alongside
 * its own `describe` calls. `test/**` is type-checked with everything else,
 * excluded from the published build, not collected as a suite, and not counted
 * in coverage.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";

import type { SimAws } from "../../src/service/aws/sim-aws.js";

export interface CreateSimIamRoleWithPolicyInput {
  readonly simAws: SimAws;

  /**
   * The Account the Role belongs to, which is the Account whose policies decide
   * the caller's side of a request.
   */
  readonly accountId: string;

  readonly roleName: string;
  readonly policyName: string;
  readonly action: string;

  /**
   * The resource the statement covers, defaulting to every resource.
   */
  readonly resource?: string;

  /**
   * The statement's effect, so a test can give the Role a Deny to prove that an
   * explicit Deny on the caller's side denies the request.
   */
  readonly effect?: "Allow" | "Deny";
}

/**
 * Create the Role and put its inline policy, returning the Role ARN.
 */
export async function createSimIamRoleWithPolicy(
  input: CreateSimIamRoleWithPolicyInput,
): Promise<string> {
  const iam = input.simAws.account(input.accountId).iam();

  const roleCreation = await iam.createRole(
    new CreateRoleCommand({
      RoleName: input.roleName,
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: { AWS: `arn:aws:iam::${input.accountId}:root` },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  await iam.putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: input.roleName,
      PolicyName: input.policyName,
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: input.effect ?? "Allow",
          Action: input.action,
          Resource: input.resource ?? "*",
        },
      }),
    }),
  );

  return roleCreation.Role.Arn;
}

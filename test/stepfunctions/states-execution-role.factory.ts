import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { AsyncMappedFactory } from "@kensio/part-factory";

import type { SimAws } from "../../src/service/aws/sim-aws.js";
import { simIamPolicyDocumentFactory } from "../../src/service/iam/policy/sim-iam-policy-document.factory.js";
import type { SimIamPolicyDocumentStatement } from "../../src/service/iam/policy/sim-iam-policy.js";

/**
 * What a state machine asks for when it wants a role to run its tasks as.
 */
export interface StatesExecutionRoleInput {
  readonly roleName: string;

  /**
   * What the role is allowed. A role given none has no policy at all, which is
   * how a state machine that may invoke nothing is written.
   */
  readonly statements: readonly SimIamPolicyDocumentStatement[];

  /**
   * The service principal the trust policy admits.
   */
  readonly trusts: string;
}

/**
 * Creates an execution role a simulated state machine assumes to do its work,
 * allowed the statements it is given and nothing else.
 *
 * ```typescript
 * const roleArn = await statesExecutionRoleFactory.make({}, simAws);
 * ```
 *
 * The default allows `lambda:InvokeFunction` on anything, because a test about
 * what a state machine does is not usually a test about which functions its
 * role may invoke. A test that is says so:
 *
 * ```typescript
 * const roleArn = await statesExecutionRoleFactory.make(
 *   { statements: [] },
 *   simAws,
 * );
 * ```
 */
export const statesExecutionRoleFactory = new AsyncMappedFactory<
  StatesExecutionRoleInput,
  string,
  SimAws
>(
  () => ({
    roleName: "WorkflowRole",
    statements: [
      { Effect: "Allow", Action: "lambda:InvokeFunction", Resource: "*" },
    ],
    trusts: "states.amazonaws.com",
  }),
  async (input, simAws) => {
    const simIam = simAws.iam();

    const created = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: input.roleName,
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { Service: input.trusts },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );

    if (input.statements.length > 0) {
      await simIam.putRolePolicy(
        new PutRolePolicyCommand({
          RoleName: input.roleName,
          PolicyName: `${input.roleName}Policy`,
          PolicyDocument: simIamPolicyDocumentFactory.make({
            Statement: input.statements,
          }),
        }),
      );
    }

    return created.Role.Arn;
  },
);

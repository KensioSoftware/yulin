import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { AsyncMappedFactory } from "@kensio/part-factory";

import type { SimAws } from "../../src/service/aws/sim-aws.js";
import { simIamPolicyDocumentFactory } from "../../src/service/iam/policy/sim-iam-policy-document.factory.js";
import type { SimIamPolicyDocumentStatement } from "../../src/service/iam/policy/sim-iam-policy.js";

/**
 * What a step of the pipeline asks for when it wants a Role to run as.
 *
 * Only the statements differ between the pipeline's functions. The trust
 * policy, the policy name and the two commands it takes to get there are the
 * same every time, so they are not asked for.
 */
export interface MediaExecutionRoleInput {
  readonly roleName: string;
  readonly statements: readonly SimIamPolicyDocumentStatement[];
}

/**
 * Creates an execution role a simulated Lambda function can run as, allowed
 * the statements it is given and nothing else.
 *
 * ```typescript
 * const roleArn = await mediaExecutionRoleFactory.make(
 *   {
 *     roleName: "ScreenUploadRole",
 *     statements: [
 *       { Effect: "Allow", Action: "s3:GetObject", Resource: objectArn },
 *     ],
 *   },
 *   simAws,
 * );
 * ```
 *
 * The trust policy admits `lambda.amazonaws.com`, because that is what a
 * function's execution role is. A Role trusted by anything else is two
 * ordinary commands with `simIamPolicyDocumentFactory` supplying the
 * documents.
 */
export const mediaExecutionRoleFactory = new AsyncMappedFactory<
  MediaExecutionRoleInput,
  string,
  SimAws
>(
  () => ({ roleName: "PipelineRole", statements: [] }),
  async (input, simAws) => {
    const simIam = simAws.iam();

    const created = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: input.roleName,
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { Service: "lambda.amazonaws.com" },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );

    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: input.roleName,
        PolicyName: `${input.roleName}Policy`,
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: input.statements,
        }),
      }),
    );

    return created.Role.Arn;
  },
);

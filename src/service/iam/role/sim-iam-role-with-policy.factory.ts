import { AsyncMappedFactory } from "@kensio/part-factory";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimCreateRoleCommandOutput } from "../command/role/create-role/create-role.command.js";
import { simIamPolicyDocumentFactory } from "../policy/sim-iam-policy-document.factory.js";

/**
 * What a test asks for when it wants a Role that may do something.
 *
 * The actions and the resource are what the test is about. The trust policy,
 * the policy name and the two commands it takes to get there are the same every
 * time, so they are not asked for.
 */
export interface SimIamRoleWithPolicyInput {
  readonly roleName: string;
  readonly policyName: string;
  readonly actions: readonly string[];
  readonly resource: string;

  /**
   * The principal creating the Role.
   *
   * A simulation given a default caller attributes these two commands to it,
   * and a Role being created for that caller has no policies to allow them
   * yet. Naming the Account root here is how such a test bootstraps.
   */
  readonly caller?: SimAwsCaller | undefined;
}

/**
 * The Role a CreateRole request answers with.
 */
export type SimIamCreatedRole = SimCreateRoleCommandOutput["Role"];

/**
 * Creates a Role allowed the actions it is given, and nothing else.
 *
 * This is the caller an authorization test needs: something to pass as
 * `{ caller: { kind: "arn", arn: role.Arn } }` that IAM will allow one thing
 * and refuse another.
 *
 * ```typescript
 * const role = await simIamRoleWithPolicyFactory.make(
 *   { roleName: "OrderWriter", actions: ["dynamodb:PutItem"] },
 *   simAws,
 * );
 * ```
 *
 * The Role is assumable by the Account root of the simulated AWS it is given,
 * which is the trust every test here wants and none of them is about. A Role
 * trusted by a service, or one allowed several resources, is two ordinary
 * commands with `simIamPolicyDocumentFactory` supplying the documents.
 */
export const simIamRoleWithPolicyFactory = new AsyncMappedFactory<
  SimIamRoleWithPolicyInput,
  SimIamCreatedRole,
  SimAws
>(
  () => ({
    roleName: "ApplicationRole",
    policyName: "ApplicationPolicy",
    actions: [],
    resource: "*",
    caller: undefined,
  }),
  async (input, simAws) => {
    const simIam = simAws.iam();
    const options =
      input.caller === undefined ? undefined : { caller: input.caller };

    const creation = await simIam.createRole(
      {
        input: {
          RoleName: input.roleName,
          AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
            Statement: {
              Principal: {
                AWS: `arn:aws:iam::${simAws.defaultAccountId}:root`,
              },
              Action: "sts:AssumeRole",
            },
          }),
        },
      },
      options,
    );

    await simIam.putRolePolicy(
      {
        input: {
          RoleName: input.roleName,
          PolicyName: input.policyName,
          PolicyDocument: simIamPolicyDocumentFactory.make({
            Statement: { Action: input.actions, Resource: input.resource },
          }),
        },
      },
      options,
    );

    return creation.Role;
  },
);

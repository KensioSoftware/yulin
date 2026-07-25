import type { SimArn } from "../../../../aws/arn.js";
import type { SimAwsAccountId } from "../../../../aws/sim-aws-account.js";
import type {
  SimCreateRoleCommand,
  SimCreateRoleCommandOutput,
} from "./create-role.command.js";

import type { SimIamPolicyDocument } from "../../../policy/sim-iam-policy.js";
import type { JSONString } from "../../../../../util/type-guard/json.js";
import type { SimIamRole, SimIamRoleName } from "../../../role/sim-iam-role.js";
import { makeSimIamRoleId } from "../../../role/sim-iam-role-id.js";

interface MakeRoleProperties {
  readonly accountId: SimAwsAccountId;
  readonly arn: SimArn;
  readonly path: string;
  readonly roleName: SimIamRoleName;
  readonly cmd: SimCreateRoleCommand;
}

/**
 * Creates simulated IAM Role records and command outputs.
 */
export class CreateRoleRecordFactory {
  /**
   * Make a sim IAM Role object from input properties.
   */
  makeRole(properties: MakeRoleProperties): SimIamRole {
    const { accountId, arn, path, roleName, cmd } = properties;
    const creationDate = new Date();

    return {
      arn,
      accountId,
      principalType: "role",
      name: roleName,
      roleId: makeSimIamRoleId(),
      roleName,
      path,
      assumeRolePolicyDocument: cmd.input.AssumeRolePolicyDocument as
        JSONString<SimIamPolicyDocument> | undefined,
      description: cmd.input.Description,
      creationDate,
      inlinePolicies: new Map(),
      attachedPolicyArns: new Set(),
    };
  }

  /**
   * Make a sim CreateRoleCommandOutput object from a sim IAM Role.
   */
  makeOutput(role: SimIamRole): SimCreateRoleCommandOutput {
    return {
      Role: {
        Path: role.path,
        RoleName: role.roleName,
        RoleId: role.roleId,
        Arn: role.arn,
        CreateDate: role.creationDate,
        AssumeRolePolicyDocument: role.assumeRolePolicyDocument,
        Description: role.description,
      },
    };
  }
}

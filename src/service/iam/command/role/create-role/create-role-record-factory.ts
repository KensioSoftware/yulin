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
import { makeSimRoleArn } from "../../../role/arn/sim-iam-role-arn.js";
import { simIamAttachedPermissionsBoundary } from "../../../role/sim-iam-role-boundary.js";
import {
  assertSimIamMaxSessionDuration,
  simIamRoleMaxSessionDurationMember,
} from "../../../role/sim-iam-role-session-duration.js";
import {
  makeSimIamIdentityTags,
  simIamTagsMember,
} from "../../../tag/sim-iam-identity-tags.js";

interface MakeRoleProperties {
  readonly accountId: SimAwsAccountId;
  readonly path: string;
  readonly roleName: SimIamRoleName;
  readonly cmd: SimCreateRoleCommand;
  readonly creationDate: Date;
}

/**
 * Creates simulated IAM Role records and command outputs.
 */
export class CreateRoleRecordFactory {
  /**
   * Make a sim IAM Role object from input properties, refusing a
   * `MaxSessionDuration` IAM would refuse.
   */
  makeRole(properties: MakeRoleProperties): SimIamRole {
    const { accountId, path, roleName, cmd, creationDate } = properties;

    assertSimIamMaxSessionDuration(cmd.input.MaxSessionDuration);

    return {
      arn: makeSimRoleArn({ accountId, path, roleName }),
      accountId,
      principalType: "role",
      name: roleName,
      roleId: makeSimIamRoleId(),
      roleName,
      path,
      assumeRolePolicyDocument: cmd.input.AssumeRolePolicyDocument as
        | JSONString<SimIamPolicyDocument>
        | undefined,
      description: cmd.input.Description,
      creationDate,
      maxSessionDuration: cmd.input.MaxSessionDuration,
      permissionsBoundaryArn: cmd.input.PermissionsBoundary as
        | SimArn
        | undefined,
      inlinePolicies: new Map(),
      attachedPolicyArns: new Set(),
      tags: makeSimIamIdentityTags(cmd.input.Tags, "Role"),
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
        ...simIamRoleMaxSessionDurationMember(role),
        PermissionsBoundary: simIamAttachedPermissionsBoundary(role),
        ...simIamTagsMember(role.tags),
      },
    };
  }
}

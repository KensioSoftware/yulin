import type { SimArn } from "../../../../aws/arn.js";
import type { SimIamRoleName } from "../../../role/sim-iam-role.js";
import type { SimIamAttachedPermissionsBoundary } from "../../../role/sim-iam-role-boundary.js";

export interface SimGetRoleCommandInput {
  readonly RoleName?: string | undefined;
}

export interface SimGetRoleCommand {
  readonly input: SimGetRoleCommandInput;
}

export interface SimGetRoleCommandOutput {
  readonly Role: {
    readonly Path: string;
    readonly RoleName: SimIamRoleName;
    readonly RoleId: string;
    readonly Arn: SimArn;
    readonly CreateDate: Date;
    readonly AssumeRolePolicyDocument?: string | undefined;
    readonly Description?: string | undefined;
    readonly PermissionsBoundary?:
      | SimIamAttachedPermissionsBoundary
      | undefined;
  };
}

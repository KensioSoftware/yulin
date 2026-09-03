import type { SimArn } from "../../../../aws/arn.js";
import type { SimIamAttachedPermissionsBoundary } from "../../../role/sim-iam-role-boundary.js";

export interface SimCreateRoleCommandInput {
  readonly RoleName?: string | undefined;
  readonly Path?: string | undefined;
  readonly AssumeRolePolicyDocument?: string | undefined;
  readonly Description?: string | undefined;

  /**
   * ARN of the managed policy to attach to the new Role as its permissions
   * boundary.
   *
   * The request carries this ARN as `iam:PermissionsBoundary`, which is the
   * key an account requiring a boundary conditions `iam:CreateRole` on.
   */
  readonly PermissionsBoundary?: string | undefined;
}

export interface SimCreateRoleCommand {
  readonly input: SimCreateRoleCommandInput;
}

export interface SimCreateRoleCommandOutput {
  readonly Role: {
    readonly Path: string;
    readonly RoleName: string;
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

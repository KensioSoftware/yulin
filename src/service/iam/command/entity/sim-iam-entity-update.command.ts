import type { SimIamCommand } from "./sim-iam-entity-policy.command.js";

export type SimUpdateRoleCommand = SimIamCommand<{
  readonly RoleName?: string | undefined;
  readonly Description?: string | undefined;
  readonly MaxSessionDuration?: number | undefined;
}>;
export type SimUpdateAssumeRolePolicyCommand = SimIamCommand<{
  readonly RoleName?: string | undefined;
  readonly PolicyDocument?: string | undefined;
}>;
export type SimPutRolePermissionsBoundaryCommand = SimIamCommand<{
  readonly RoleName?: string | undefined;
  readonly PermissionsBoundary?: string | undefined;
}>;
export type SimDeleteRolePermissionsBoundaryCommand = SimIamCommand<{
  readonly RoleName?: string | undefined;
}>;
export type SimPutUserPermissionsBoundaryCommand = SimIamCommand<{
  readonly UserName?: string | undefined;
  readonly PermissionsBoundary?: string | undefined;
}>;
export type SimDeleteUserPermissionsBoundaryCommand = SimIamCommand<{
  readonly UserName?: string | undefined;
}>;
export type SimUpdateUserCommand = SimIamCommand<{
  readonly UserName?: string | undefined;
  readonly NewUserName?: string | undefined;
  readonly NewPath?: string | undefined;
}>;
export type SimUpdateGroupCommand = SimIamCommand<{
  readonly GroupName?: string | undefined;
  readonly NewGroupName?: string | undefined;
  readonly NewPath?: string | undefined;
}>;

import type { SimArn } from "../../../../aws/arn.js";

export interface SimCreateRoleCommandInput {
  readonly RoleName?: string | undefined;
  readonly Path?: string | undefined;
  readonly AssumeRolePolicyDocument?: string | undefined;
  readonly Description?: string | undefined;
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
  };
}

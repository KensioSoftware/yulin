import type { SimArn } from "../../../../aws/arn.js";

export interface SimGetRoleCommandInput {
  readonly RoleName?: string | undefined;
}

export interface SimGetRoleCommand {
  readonly input: SimGetRoleCommandInput;
}

export interface SimGetRoleCommandOutput {
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

import type { SimArn } from "../../../../aws/arn.js";

export interface SimListRolesCommandInput {
  readonly PathPrefix?: string | undefined;
  readonly Marker?: string | undefined;
  readonly MaxItems?: number | undefined;
}

export interface SimListRolesCommand {
  readonly input: SimListRolesCommandInput;
}

export interface SimListRolesCommandOutput {
  readonly Roles: {
    readonly Path: string;
    readonly RoleName: string;
    readonly RoleId: string;
    readonly Arn: SimArn;
    readonly CreateDate: Date;
    readonly AssumeRolePolicyDocument?: string | undefined;
    readonly Description?: string | undefined;
  }[];
  readonly IsTruncated?: boolean;
  readonly Marker?: string | undefined;
}

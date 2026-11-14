import type { SimArn } from "../../../../aws/arn.js";
import type { SimIamAttachedPermissionsBoundary } from "../../../role/sim-iam-role-boundary.js";
import type {
  SimIamTag,
  SimIamTagsInput,
} from "../../../tag/sim-iam-identity-tags.js";

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

  /**
   * Tags to attach to the new Role. Creating a Role with tags needs
   * `iam:TagRole` as well as `iam:CreateRole`.
   */
  readonly Tags?: SimIamTagsInput;
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
    readonly Tags?: readonly SimIamTag[] | undefined;
  };
}

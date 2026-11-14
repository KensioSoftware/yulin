import type { SimArn } from "../../../../aws/arn.js";
import type { SimIamAttachedPermissionsBoundary } from "../../../role/sim-iam-role-boundary.js";
import type {
  SimIamTag,
  SimIamTagsInput,
} from "../../../tag/sim-iam-identity-tags.js";

export interface SimCreateUserCommandInput {
  readonly UserName?: string | undefined;
  readonly Path?: string | undefined;

  /**
   * ARN of the managed policy to set as the new User's permissions boundary.
   * The request carries it as `iam:PermissionsBoundary`.
   */
  readonly PermissionsBoundary?: string | undefined;

  /**
   * Tags to attach to the new User. Creating a User with tags needs
   * `iam:TagUser` as well as `iam:CreateUser`.
   */
  readonly Tags?: SimIamTagsInput;
}

export interface SimCreateUserCommand {
  readonly input: SimCreateUserCommandInput;
}

export interface SimCreateUserCommandOutput {
  readonly User: {
    readonly Path: string;
    readonly UserName: string;
    readonly UserId: string;
    readonly Arn: SimArn;
    readonly CreateDate: Date;
    readonly PermissionsBoundary?:
      | SimIamAttachedPermissionsBoundary
      | undefined;
    readonly Tags?: readonly SimIamTag[] | undefined;
  };
}

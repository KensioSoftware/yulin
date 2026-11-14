import type {
  SimIamTag,
  SimIamTagsInput,
} from "../../tag/sim-iam-identity-tags.js";
import type { SimCreateRoleCommandOutput } from "../role/create-role/create-role.command.js";
import type {
  SimIamCommand,
  SimIamListingOutput,
} from "../entity/sim-iam-entity-policy.command.js";
import type { SimIamPageInput } from "../sim-iam-page.js";

/**
 * An instance profile as IAM describes one, with the Role it holds.
 */
export interface SimIamInstanceProfileOutput {
  readonly Path: string;
  readonly InstanceProfileName: string;
  readonly InstanceProfileId: string;
  readonly Arn: string;
  readonly CreateDate: Date;
  readonly Roles: readonly SimCreateRoleCommandOutput["Role"][];
  readonly Tags?: readonly SimIamTag[];
}

export type SimCreateInstanceProfileCommand = SimIamCommand<{
  readonly InstanceProfileName?: string | undefined;
  readonly Path?: string | undefined;
  readonly Tags?: SimIamTagsInput;
}>;
export interface SimInstanceProfileCommandOutput {
  readonly InstanceProfile: SimIamInstanceProfileOutput;
}
export type SimInstanceProfileCommand = SimIamCommand<{
  readonly InstanceProfileName?: string | undefined;
}>;
export type SimInstanceProfileRoleCommand = SimIamCommand<{
  readonly InstanceProfileName?: string | undefined;
  readonly RoleName?: string | undefined;
}>;
export type SimListInstanceProfilesCommand = SimIamCommand<
  SimIamPageInput & { readonly PathPrefix?: string | undefined }
>;
export type SimListInstanceProfilesForRoleCommand = SimIamCommand<
  SimIamPageInput & { readonly RoleName?: string | undefined }
>;
export interface SimListInstanceProfilesCommandOutput extends SimIamListingOutput {
  readonly InstanceProfiles: readonly SimIamInstanceProfileOutput[];
}

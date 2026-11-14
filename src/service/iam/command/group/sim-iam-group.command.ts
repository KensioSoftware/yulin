import type { SimIamGroup } from "../../group/sim-iam-group.js";
import type { SimIamPageInput } from "../sim-iam-page.js";
import type { CreateUserRecordFactory } from "../user/create-user/create-user-record-factory.js";
import type {
  SimIamCommand,
  SimIamListingOutput,
} from "../entity/sim-iam-entity-policy.command.js";

/**
 * A group as IAM describes one.
 */
export interface SimIamGroupOutput {
  readonly Path: string;
  readonly GroupName: string;
  readonly GroupId: string;
  readonly Arn: string;
  readonly CreateDate: Date;
}

export type SimCreateGroupCommand = SimIamCommand<{
  readonly GroupName?: string | undefined;
  readonly Path?: string | undefined;
}>;
export interface SimCreateGroupCommandOutput {
  readonly Group: SimIamGroupOutput;
}
export type SimGetGroupCommand = SimIamCommand<
  SimIamPageInput & { readonly GroupName?: string | undefined }
>;
export interface SimGetGroupCommandOutput extends SimIamListingOutput {
  readonly Group: SimIamGroupOutput;
  readonly Users: ReturnType<CreateUserRecordFactory["makeOutput"]>["User"][];
}
export type SimListGroupsCommand = SimIamCommand<
  SimIamPageInput & { readonly PathPrefix?: string | undefined }
>;
export type SimListGroupsForUserCommand = SimIamCommand<
  SimIamPageInput & { readonly UserName?: string | undefined }
>;
export interface SimListGroupsCommandOutput extends SimIamListingOutput {
  readonly Groups: readonly SimIamGroupOutput[];
}
export type SimDeleteGroupCommand = SimIamCommand<{
  readonly GroupName?: string | undefined;
}>;
export type SimGroupMembershipCommand = SimIamCommand<{
  readonly GroupName?: string | undefined;
  readonly UserName?: string | undefined;
}>;

/**
 * Describe a group the way IAM does.
 */
export function simIamGroupOutput(group: SimIamGroup): SimIamGroupOutput {
  return {
    Path: group.path,
    GroupName: group.groupName,
    GroupId: group.groupId,
    Arn: group.arn,
    CreateDate: group.creationDate,
  };
}

import type { SimIamPageInput } from "../sim-iam-page.js";

/**
 * A structural IAM command, carrying its input the way the SDK does.
 */
export interface SimIamCommand<Input> {
  readonly input: Input;
}

/**
 * The input naming one Role, User or group, under the member IAM gives it.
 */
export type SimIamEntityNameInput<NameMember extends string> = Readonly<
  Partial<Record<NameMember, string | undefined>>
>;

/**
 * The input of a command reading or removing one inline policy.
 */
export type SimIamInlinePolicyInput<NameMember extends string> =
  SimIamEntityNameInput<NameMember> & {
    readonly PolicyName?: string | undefined;
  };

/**
 * The input of a command putting one inline policy.
 */
export type SimIamPutInlinePolicyInput<NameMember extends string> =
  SimIamInlinePolicyInput<NameMember> & {
    readonly PolicyDocument?: string | undefined;
  };

/**
 * The input of a command attaching or detaching one managed policy.
 */
export type SimIamManagedPolicyInput<NameMember extends string> =
  SimIamEntityNameInput<NameMember> & {
    readonly PolicyArn?: string | undefined;
  };

/**
 * The input of a command listing an entity's policies a page at a time.
 */
export type SimIamListEntityPoliciesInput<NameMember extends string> =
  SimIamEntityNameInput<NameMember> &
    SimIamPageInput & {
      readonly PathPrefix?: string | undefined;
    };

/**
 * IAM answers a command that changes something with an empty body.
 */
export type SimIamEmptyOutput = Record<string, never>;

/**
 * The answer to a GetRolePolicy, GetUserPolicy or GetGroupPolicy command.
 *
 * The document is URL-encoded, as IAM sends it.
 */
export type SimIamGetInlinePolicyOutput = Readonly<Record<string, string>> & {
  readonly PolicyName: string;
  readonly PolicyDocument: string;
};

/**
 * The paging members of a listing answer.
 */
export interface SimIamListingOutput {
  readonly IsTruncated: boolean;
  readonly Marker?: string | undefined;
}

/**
 * The answer to a ListRolePolicies, ListUserPolicies or ListGroupPolicies
 * command.
 */
export interface SimIamListInlinePoliciesOutput extends SimIamListingOutput {
  readonly PolicyNames: readonly string[];
}

/**
 * The answer to a ListAttachedGroupPolicies command.
 */
export interface SimIamListAttachedPoliciesOutput extends SimIamListingOutput {
  readonly AttachedPolicies: readonly {
    readonly PolicyName: string;
    readonly PolicyArn: string;
  }[];
}

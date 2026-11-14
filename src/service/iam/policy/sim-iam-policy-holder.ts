import type { JSONString } from "../../../util/type-guard/json.js";
import type { SimArn } from "../../aws/arn.js";
import type { SimIamPolicyDocument } from "./sim-iam-policy.js";
import type { SimIamIdentityTags } from "../tag/sim-iam-identity-tags.js";

/**
 * A Role, a User or a group, as far as holding identity policies goes.
 */
export interface SimIamPolicyHolder {
  readonly arn: string;
  readonly inlinePolicies: Map<string, JSONString<SimIamPolicyDocument>>;
  readonly attachedPolicyArns: Set<SimArn>;
  readonly tags?: SimIamIdentityTags | undefined;
}

/**
 * How IAM names each kind of policy holder in its actions and members.
 */
export type SimIamPolicyHolderKind = "Role" | "User" | "Group";

/**
 * The limits IAM puts on the policies one kind of holder carries.
 *
 * https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_iam-quotas.html
 */
export interface SimIamPolicyHolderQuota {
  /**
   * The most managed policies one holder may have attached.
   */
  readonly managedPolicies: number;

  /**
   * The most characters, whitespace left out, all of one holder's inline
   * policies may sum to.
   */
  readonly inlineCharacters: number;
}

/**
 * IAM's default quota for each kind of policy holder.
 */
export const simIamPolicyHolderQuotas: Readonly<
  Record<SimIamPolicyHolderKind, SimIamPolicyHolderQuota>
> = {
  Role: { managedPolicies: 20, inlineCharacters: 10_240 },
  User: { managedPolicies: 10, inlineCharacters: 2048 },
  Group: { managedPolicies: 10, inlineCharacters: 5120 },
};

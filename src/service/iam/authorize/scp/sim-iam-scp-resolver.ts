import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { SimIamPolicyDocument } from "../../policy/sim-iam-policy.js";

/**
 * One service control policy applying to a simulated Account.
 *
 * The name travels with the document so a denial can say which policy produced
 * it, the way an AWS denial names the policy in the console.
 */
export interface SimIamServiceControlPolicy {
  readonly document: SimIamPolicyDocument;
  readonly policyName?: string | undefined;
}

/**
 * The service control policies in force for one Account.
 *
 * Whether any apply is a separate fact from how many there are. An Account
 * whose only attached policy has been detached is still inside the
 * organization, and nothing allowing an action there denies it. An Account
 * outside every organization is unrestricted. Both hold no policies, so the
 * list alone cannot tell them apart.
 */
export interface SimIamServiceControlPolicySet {
  readonly applies: boolean;
  readonly policies: readonly SimIamServiceControlPolicy[];
}

/**
 * Where sim IAM asks what an Account's organization allows it to do.
 *
 * IAM belongs to one Account and an organization spans several, so the
 * organization is reached through this interface instead of being held by IAM
 * itself. A standalone SimIam has no organization around it and leaves the
 * resolver out, which is the same as an Account outside any organization.
 */
export interface SimIamServiceControlPolicyResolver {
  /**
   * The service control policies in force for an Account.
   *
   * A set that does not apply leaves the Account's identity and resource
   * policies to decide the request on their own.
   */
  serviceControlPolicySetFor(
    accountId: SimAwsAccountId,
  ): SimIamServiceControlPolicySet;
}

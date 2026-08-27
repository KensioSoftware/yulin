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
 * The policies attached at one level of the organization above an Account.
 *
 * AWS requires an Allow at every level between the root and the Account, so
 * which level a policy came from decides the request rather than decorating
 * it. The name is what a denial calls the level.
 */
export interface SimIamServiceControlPolicyLevel {
  readonly nodeName: string;
  readonly policies: readonly SimIamServiceControlPolicy[];
}

/**
 * The service control policies in force for one Account.
 *
 * Whether any apply is a separate fact from how many levels there are. An
 * Account whose every policy has been detached is still inside the
 * organization, and nothing allowing an action there denies it. An Account
 * outside every organization is unrestricted. Both can hold no policy, so the
 * levels alone cannot tell them apart.
 */
export interface SimIamServiceControlPolicySet {
  readonly applies: boolean;
  readonly levels: readonly SimIamServiceControlPolicyLevel[];
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

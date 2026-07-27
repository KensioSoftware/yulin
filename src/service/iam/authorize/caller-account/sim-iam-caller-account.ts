import type { SimIamAllowRequirement } from "../allow/sim-iam-allow-requirement.js";
import type { SimIamAuthZPolicySource } from "../context/sim-iam-auth-z-context.js";

/**
 * What the Account owning the caller contributes to an authorization request.
 *
 * The Account evaluating a request owns the resource. Whether the caller
 * belongs to that same Account decides two things at once: which identity
 * policies are in scope, and how an Allow from each side is combined. Both
 * answers come from here so they cannot disagree.
 */
export interface SimIamCallerAccount {
  /**
   * Identity policies contributed by the caller's own Account.
   */
  readonly identityPolicies: readonly SimIamAuthZPolicySource[];

  /**
   * How identity and resource Allows combine for this caller.
   */
  readonly allowRequirement: SimIamAllowRequirement;
}

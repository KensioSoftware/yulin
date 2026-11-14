import type { SimIamAllowRequirement } from "../allow/sim-iam-allow-requirement.js";
import type {
  SimIamAuthZPolicyLimit,
  SimIamAuthZPolicySource,
} from "../context/sim-iam-auth-z-context.js";

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
   * The permissions boundary the caller's own Account sets on it, or
   * undefined where the evaluating Account's IAM holds the caller and reads
   * it itself.
   */
  readonly permissionsBoundary?: SimIamAuthZPolicyLimit | undefined;

  /**
   * How identity and resource Allows combine for this caller.
   */
  readonly allowRequirement: SimIamAllowRequirement;
}

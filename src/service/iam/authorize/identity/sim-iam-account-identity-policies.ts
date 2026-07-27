import type { SimAwsPrincipal } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamAuthZPolicySource } from "../context/sim-iam-auth-z-context.js";

/**
 * Identity-based policy discovery for principals belonging to one Account.
 *
 * This is the capability one Account's IAM needs from another Account's IAM to
 * decide a cross-Account request: the policies the caller's own Account applies
 * to its own principal. SimIam implements it, so a resource-owning Account can
 * ask the caller's Account without depending on the whole service facade.
 */
export interface SimIamAccountIdentityPolicies {
  identityPolicySourcesFor(
    principal: SimAwsPrincipal,
  ): readonly SimIamAuthZPolicySource[];
}

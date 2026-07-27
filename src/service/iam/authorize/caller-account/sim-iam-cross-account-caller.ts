import type { SimAwsPrincipal } from "../../../aws/caller/sim-aws-caller.js";
import {
  type SimIamAllowRequirement,
  SimIamBothSidesAllowRequirement,
} from "../allow/sim-iam-allow-requirement.js";
import type { SimIamAuthZPolicySource } from "../context/sim-iam-auth-z-context.js";
import type { SimIamAccountIdentityPolicies } from "../identity/sim-iam-account-identity-policies.js";
import type { SimIamCallerAccount } from "./sim-iam-caller-account.js";

interface SimIamCrossAccountCallerProperties {
  /**
   * The identity whose policies apply to the request, in the caller's Account.
   */
  readonly principal: SimAwsPrincipal;

  /**
   * Simulated IAM of the Account owning the caller, when the simulation has it.
   */
  readonly callerAccountIam?: SimIamAccountIdentityPolicies | undefined;
}

/**
 * A caller belonging to a different Account from the resource.
 *
 * AWS decides such a request in both Accounts, so the identity policies of the
 * caller's own Account are pulled in and both sides are then required to allow.
 * A resource policy naming another Account's principal delegates to that
 * Account rather than granting on its own behalf.
 *
 * An Account the simulation knows nothing about contributes no identity
 * policies, which denies the request. That matches AWS for the case it
 * represents: a principal ARN that was never given any permissions.
 */
export class SimIamCrossAccountCaller implements SimIamCallerAccount {
  readonly identityPolicies: readonly SimIamAuthZPolicySource[];

  readonly allowRequirement: SimIamAllowRequirement =
    new SimIamBothSidesAllowRequirement();

  constructor(properties: SimIamCrossAccountCallerProperties) {
    this.identityPolicies =
      properties.callerAccountIam?.identityPolicySourcesFor(
        properties.principal,
      ) ?? [];
  }
}

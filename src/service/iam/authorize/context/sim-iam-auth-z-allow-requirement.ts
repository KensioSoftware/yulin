import {
  type SimIamAllowRequirement,
  SimIamCallerPermissionRequirement,
  SimIamEveryAllowRequirement,
  SimIamMandatoryResourcePolicyRequirement,
} from "../allow/sim-iam-allow-requirement.js";
import type { SimIamCallerAccount } from "../caller-account/sim-iam-caller-account.js";

/**
 * What an authorization request says about the rules it is subject to, beyond
 * the caller and the policies themselves.
 */
export interface SimIamAllowRequirementInput {
  readonly requiresResourcePolicyAllow?: boolean | undefined;
  readonly withCallerPermissions?: boolean | undefined;
}

/**
 * Works out which allow rules apply to one authorization request.
 *
 * Three things decide it, and all of them have to hold. The caller's Account
 * says whose Allow counts: either side within one Account, both sides across
 * Accounts. The resource-owning service says whether its resource insists on
 * allowing, which is true of a KMS key and of nothing else so far, and whether
 * it is passing on the caller's own permissions rather than its own.
 */
export class SimIamAuthZAllowRequirement {
  /**
   * The rule a request is subject to.
   */
  resolve(
    callerAccount: SimIamCallerAccount,
    input: SimIamAllowRequirementInput,
  ): SimIamAllowRequirement {
    const requirements: SimIamAllowRequirement[] = [
      callerAccount.allowRequirement,
    ];

    if (input.requiresResourcePolicyAllow === true) {
      requirements.push(new SimIamMandatoryResourcePolicyRequirement());
    }

    if (input.withCallerPermissions === true) {
      requirements.push(new SimIamCallerPermissionRequirement());
    }

    return new SimIamEveryAllowRequirement(requirements);
  }
}

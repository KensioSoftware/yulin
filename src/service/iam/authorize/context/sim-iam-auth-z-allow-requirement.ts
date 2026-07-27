import {
  type SimIamAllowRequirement,
  SimIamEveryAllowRequirement,
  SimIamMandatoryResourcePolicyRequirement,
} from "../allow/sim-iam-allow-requirement.js";
import type { SimIamCallerAccount } from "../caller-account/sim-iam-caller-account.js";

/**
 * Works out which allow rules apply to one authorization request.
 *
 * Two things decide it, and both have to hold. The caller's Account says whose
 * Allow counts: either side within one Account, both sides across Accounts.
 * The resource-owning service says whether its resource insists on allowing,
 * which is true of a KMS key and of nothing else so far.
 */
export class SimIamAuthZAllowRequirement {
  /**
   * The rule a request is subject to.
   */
  resolve(
    callerAccount: SimIamCallerAccount,
    requiresResourcePolicyAllow: boolean | undefined,
  ): SimIamAllowRequirement {
    if (requiresResourcePolicyAllow !== true) {
      return callerAccount.allowRequirement;
    }

    return new SimIamEveryAllowRequirement([
      callerAccount.allowRequirement,
      new SimIamMandatoryResourcePolicyRequirement(),
    ]);
  }
}

import {
  type SimIamAllowRequirement,
  SimIamEitherSideAllowRequirement,
} from "../allow/sim-iam-allow-requirement.js";
import type { SimIamAuthZPolicySource } from "../context/sim-iam-auth-z-context.js";
import type { SimIamCallerAccount } from "./sim-iam-caller-account.js";

/**
 * A caller decided entirely within the Account that owns the resource.
 *
 * This covers a principal belonging to that Account, and callers with no
 * identity side at all: a service principal or an anonymous request, which AWS
 * allows on a resource policy alone.
 *
 * The Account's own IAM state already holds every identity policy in scope, so
 * nothing is contributed here.
 */
export class SimIamSameAccountCaller implements SimIamCallerAccount {
  readonly identityPolicies: readonly SimIamAuthZPolicySource[] = [];

  readonly allowRequirement: SimIamAllowRequirement =
    new SimIamEitherSideAllowRequirement();
}

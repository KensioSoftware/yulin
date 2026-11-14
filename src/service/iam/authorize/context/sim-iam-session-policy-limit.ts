import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import {
  type SimIamAuthZPolicyLimit,
  simIamNoPolicyLimit,
} from "./sim-iam-auth-z-context.js";

/**
 * The session policies a caller carries, as a limit on its permissions.
 *
 * A session created without any carries no limit. AWS describes that case as
 * a default session policy allowing everything the Role allows.
 */
export function simIamSessionPolicyLimit(
  caller: SimAwsResolvedCaller,
): SimIamAuthZPolicyLimit {
  const policies = caller.sessionPolicies;

  if (policies === undefined) {
    return simIamNoPolicyLimit;
  }

  return {
    applies: true,
    sources: policies.map((policy) => ({
      sourceType: "session",
      document: policy.document,
      policyName: policy.policyName,
      policyArn: policy.policyArn,
    })),
  };
}

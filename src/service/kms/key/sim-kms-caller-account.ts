import type { SimAwsResolvedCaller } from "../../aws/caller/sim-aws-caller-resolver.js";
import type { SimIamCallerConditionSource } from "../../iam/authorize/context/sim-iam-caller-condition-source.js";
import type { SimIamConditionValue } from "../../iam/policy/sim-iam-policy.js";

/**
 * The condition key naming the Account a KMS request came from.
 */
export const simKmsCallerAccountConditionKey = "kms:CallerAccount";

/**
 * Supplies `kms:CallerAccount` from the caller IAM resolved.
 *
 * This is the other half of the AWS managed key policy: the policy admits any
 * principal reaching the key through the owning service, so it has to say
 * which Account those principals may belong to.
 *
 * A caller with no Account, such as an anonymous or service principal, leaves
 * the key out of the condition context, and a policy conditioned on it then
 * fails to match rather than matching anything.
 */
export class SimKmsCallerAccountCondition implements SimIamCallerConditionSource {
  /**
   * The Account of the resolved caller, where it has one.
   */
  conditionValuesFor(
    caller: SimAwsResolvedCaller,
  ): Readonly<Record<string, SimIamConditionValue>> {
    if (caller.accountId === undefined) {
      return {};
    }

    return { [simKmsCallerAccountConditionKey]: caller.accountId };
  }
}

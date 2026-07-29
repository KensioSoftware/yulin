import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimIamConditionValue } from "../../policy/sim-iam-policy.js";

/**
 * Condition values a service can only work out once IAM has resolved the
 * caller.
 *
 * Most condition values a service supplies are properties of the request, so
 * it has them before it asks IAM anything. A few are properties of whoever
 * turns out to be making the request, and only IAM can say who that is: a
 * caller may arrive as credentials to authenticate or be omitted altogether.
 * `kms:CallerAccount` is one, naming the Account a KMS request came from.
 *
 * The values stay with the service that owns the condition key rather than
 * being derived by IAM for every request, since a key such as
 * `kms:CallerAccount` exists only in KMS and matching it elsewhere would be
 * looser than AWS.
 */
export interface SimIamCallerConditionSource {
  conditionValuesFor(
    caller: SimAwsResolvedCaller,
  ): Readonly<Record<string, SimIamConditionValue>>;
}

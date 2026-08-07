import type { SimIamConditionValue } from "../../../iam/policy/sim-iam-policy.js";
import {
  simSnsSourceAccountConditionKey,
  simSnsSourceArnConditionKey,
  type SimSnsRequestOptions,
} from "../sim-sns-request-options.js";

/**
 * The request-time values a topic policy statement's conditions are matched
 * against.
 *
 * A value the request does not carry is left out rather than supplied empty, so
 * a statement conditioned on it fails to match instead of matching an empty
 * string. That is the safe direction: a grant written for one Bucket should not
 * admit a request that says nothing about where it came from.
 */
export function simSnsConditionContext(
  options: SimSnsRequestOptions | undefined,
): Readonly<Record<string, SimIamConditionValue>> {
  return {
    ...(options?.sourceArn !== undefined && {
      [simSnsSourceArnConditionKey]: options.sourceArn,
    }),
    ...(options?.sourceAccount !== undefined && {
      [simSnsSourceAccountConditionKey]: options.sourceAccount,
    }),
  };
}

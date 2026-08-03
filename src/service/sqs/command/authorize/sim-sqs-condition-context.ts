import type { SimIamConditionValue } from "../../../iam/policy/sim-iam-policy.js";
import {
  simSqsSourceArnConditionKey,
  type SimSqsRequestOptions,
} from "../sim-sqs-request-options.js";

/**
 * The request-time values a queue policy statement's conditions are matched
 * against.
 *
 * A value the request does not carry is left out rather than supplied empty, so
 * a statement conditioned on it fails to match instead of matching an empty
 * string. That is the safe direction: a grant written for one Bucket should not
 * admit a request that says nothing about where it came from.
 */
export function simSqsConditionContext(
  options: SimSqsRequestOptions | undefined,
): Readonly<Record<string, SimIamConditionValue>> {
  if (options?.sourceArn === undefined) {
    return {};
  }

  return { [simSqsSourceArnConditionKey]: options.sourceArn };
}

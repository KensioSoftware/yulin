import type { SimIamConditionValue } from "../../../iam/policy/sim-iam-policy.js";
import {
  simS3SourceAccountConditionKey,
  simS3SourceArnConditionKey,
  type SimS3RequestOptions,
} from "../sim-s3-request-options.js";

/**
 * The request-time values a Bucket policy statement's conditions are matched
 * against.
 *
 * A value the request does not carry is left out rather than supplied empty, so
 * a statement conditioned on it fails to match instead of matching an empty
 * string. That is the safe direction: a grant written for one CloudFront
 * Distribution should not admit a read that says nothing about where it came
 * from.
 */
export function simS3ConditionContext(
  options: SimS3RequestOptions | undefined,
): Readonly<Record<string, SimIamConditionValue>> {
  return {
    ...(options?.sourceArn !== undefined && {
      [simS3SourceArnConditionKey]: options.sourceArn,
    }),
    ...(options?.sourceAccount !== undefined && {
      [simS3SourceAccountConditionKey]: options.sourceAccount,
    }),
  };
}

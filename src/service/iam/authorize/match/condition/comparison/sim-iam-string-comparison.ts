import { simIamArnMatch } from "../../../sim-iam-arn-match.js";
import { simIamWildcardMatch } from "../../../sim-iam-wildcard.js";
import type {
  SimIamScalarConditionValue,
  SimIamValueComparison,
} from "./sim-iam-value-comparison.js";

/**
 * Compare two values as strings, or answer undefined if either is not one.
 *
 * A number or a boolean in a string condition is refused. IAM compares the
 * text of a policy value, and coercing `2` to `"2"` would let a condition match
 * a value its author never wrote.
 */
function stringComparison(
  compare: (actual: string, expected: string) => boolean,
): SimIamValueComparison {
  return (
    actual: SimIamScalarConditionValue,
    expected: SimIamScalarConditionValue,
  ) => {
    if (typeof actual !== "string" || typeof expected !== "string") {
      return;
    }

    return compare(actual, expected);
  };
}

/**
 * The comparison `StringEquals` and `StringNotEquals` are built from.
 */
export const simIamStringEqualsComparison = stringComparison(
  (actual, expected) => actual === expected,
);

/**
 * The comparison `StringEqualsIgnoreCase` and `StringNotEqualsIgnoreCase` are
 * built from.
 */
export const simIamStringEqualsIgnoreCaseComparison = stringComparison(
  (actual, expected) => actual.toLowerCase() === expected.toLowerCase(),
);

/**
 * The comparison `StringLike` and `StringNotLike` are built from.
 */
export const simIamStringLikeComparison = stringComparison((actual, expected) =>
  simIamWildcardMatch(expected, actual, { caseSensitive: true }),
);

/**
 * The comparison the four ARN operators are built from.
 *
 * AWS documents `ArnEquals` and `ArnLike` as behaving identically, so one
 * comparison serves both of them and both of their negated forms.
 */
export const simIamArnComparison = stringComparison((actual, expected) =>
  simIamArnMatch(expected, actual),
);

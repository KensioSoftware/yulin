import { simIamArnMatch } from "../../sim-iam-arn-match.js";
import { simIamWildcardMatch } from "../../sim-iam-wildcard.js";

/**
 * Compares one request value with one policy value.
 *
 * Condition operators differ in how they quantify over the values on each
 * side, and in whether they negate the result. The comparison of a single
 * pair is the part they share, so `StringNotLike` is the same comparison as
 * `StringLike` with the answer turned around.
 */
export type SimIamStringComparison = (
  actual: string,
  expected: string,
) => boolean;

/**
 * The comparison `StringEquals` and `StringNotEquals` are built from.
 */
export const simIamStringEqualsComparison: SimIamStringComparison = (
  actual,
  expected,
) => actual === expected;

/**
 * The comparison `StringLike` and `StringNotLike` are built from.
 */
export const simIamStringLikeComparison: SimIamStringComparison = (
  actual,
  expected,
) => simIamWildcardMatch(expected, actual, { caseSensitive: true });

/**
 * The comparison the four ARN operators are built from.
 *
 * AWS documents `ArnEquals` and `ArnLike` as behaving identically, so one
 * comparison serves both of them and both of their negated forms.
 */
export const simIamArnComparison: SimIamStringComparison = (actual, expected) =>
  simIamArnMatch(expected, actual);

import type {
  SimIamConditionValue,
  SimIamPolicyDocumentCondition,
} from "../../../iam/policy/sim-iam-policy.js";

/**
 * Condition keys that tie a wildcard Principal down to specific callers.
 *
 * These are the keys real S3 accepts as making an otherwise public Bucket
 * policy non-public. `aws:SourceIp` is deliberately absent: S3 judges a CIDR
 * range's breadth, treating anything wider than /8 as still public, and the
 * simulator does not model that. Leaving it out means such a policy is treated
 * as public, which errs toward refusing rather than allowing.
 */
const pinningConditionKeys: ReadonlySet<string> = new Set([
  "aws:principalorgid",
  "aws:sourcearn",
  "aws:sourcevpc",
  "aws:sourcevpce",
  "aws:sourceowner",
  "aws:sourceaccount",
  "aws:userid",
  "s3:dataaccesspointarn",
  "s3:dataaccesspointaccount",
]);

/**
 * Condition operators that pin a key to a value.
 *
 * Negative and `IfExists` operators are absent because neither constrains who
 * can call: an `IfExists` condition passes when the key is missing entirely.
 */
const pinningOperators: ReadonlySet<string> = new Set([
  "stringequals",
  "stringequalsignorecase",
  "stringlike",
  "arnequals",
  "arnlike",
]);

/**
 * Whether a statement Condition constrains a wildcard Principal to fixed
 * values, which is what stops real S3 counting the statement as public.
 */
export function simS3ConditionPinsPrincipal(
  condition: SimIamPolicyDocumentCondition | undefined,
): boolean {
  if (condition === undefined) {
    return false;
  }

  for (const [operator, keyValues] of Object.entries(condition)) {
    if (!pinningOperators.has(operator.toLowerCase())) {
      continue;
    }

    if (pinsAnyKey(keyValues)) {
      return true;
    }
  }

  return false;
}

function pinsAnyKey(
  keyValues: Readonly<Record<string, SimIamConditionValue>>,
): boolean {
  for (const [conditionKey, value] of Object.entries(keyValues)) {
    if (
      pinningConditionKeys.has(conditionKey.toLowerCase()) &&
      isFixedValue(value)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * A value is fixed when it matches one caller rather than a set of them, so no
 * wildcard characters and no unresolved IAM policy variable.
 */
function isFixedValue(value: SimIamConditionValue): boolean {
  const values = Array.isArray(value) ? value : [value];

  return values.every(
    (candidate) =>
      typeof candidate === "string" &&
      candidate.length > 0 &&
      !candidate.includes("*") &&
      !candidate.includes("?") &&
      !candidate.includes("${"),
  );
}

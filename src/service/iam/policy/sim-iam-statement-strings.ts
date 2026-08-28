import { SimIamMalformedPolicyDocument } from "../error/sim-iam.error.js";

/**
 * Read a statement field holding either one string or a list of strings.
 *
 * Action, NotAction, Resource and NotResource each take either shape, and
 * anything else is a malformed document. An unresolved CloudFormation intrinsic
 * is the usual way one arrives. The IAM policy parsers store `PolicyDocument`
 * whole, and a `Ref` or `Fn::GetAtt` nested inside a statement is kept as
 * written. Refusing it here keeps it out of evaluation, where the same value
 * surfaces as a `TypeError` naming no policy.
 */
export function simIamStatementStrings(
  value: unknown,
  label: string,
  field: string,
): readonly string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    return [value];
  }

  if (isStringArray(value)) {
    return [...value];
  }

  throw new SimIamMalformedPolicyDocument(
    `${label}: ${field} must be a string or an array of strings, but holds ${JSON.stringify(
      value,
    )}`,
  );
}

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    (value as readonly unknown[]).every((entry) => typeof entry === "string")
  );
}

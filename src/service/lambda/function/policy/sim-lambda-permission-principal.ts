import type { SimIamPolicyDocumentPrincipal } from "../../../iam/policy/sim-iam-policy.js";

const accountIdPattern = /^\d{12}$/u;

/**
 * Convert an AddPermission `Principal` into the policy Principal it becomes.
 *
 * Real Lambda accepts a shorthand here that IAM policy documents do not: an
 * Account id, a service name, an ARN, or `*`. AddPermission expands whichever
 * was given into the corresponding policy form, and `GetPolicy` returns the
 * expanded document, so the same expansion happens here.
 */
export function simLambdaPermissionPrincipal(
  principal: string,
): SimIamPolicyDocumentPrincipal {
  if (principal === "*") {
    return "*";
  }

  if (accountIdPattern.test(principal)) {
    return { AWS: `arn:aws:iam::${principal}:root` };
  }

  if (principal.startsWith("arn:")) {
    return { AWS: principal };
  }

  return { Service: principal };
}

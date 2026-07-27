import type {
  SimIamPolicyDocumentPrincipal,
  SimIamPolicyDocumentPrincipalObject,
} from "../../../iam/policy/sim-iam-policy.js";

/**
 * Whether a policy statement Principal names everyone rather than fixed
 * identities.
 *
 * Only the `AWS` principal type can be a wildcard that opens a Bucket to the
 * world. A `Service`, `Federated` or `CanonicalUser` principal names something
 * specific, so a statement granting one of those is not public.
 */
export function simS3PrincipalIsWildcard(
  principal: SimIamPolicyDocumentPrincipal | undefined,
): boolean {
  if (principal === undefined) {
    // A Bucket policy statement must name a Principal. One that does not is
    // not something the simulator can classify, so it counts as public.
    return true;
  }

  if (typeof principal === "string") {
    return principal === "*";
  }

  if (Array.isArray(principal)) {
    return principal.includes("*");
  }

  return awsPrincipalIsWildcard(
    principal as SimIamPolicyDocumentPrincipalObject,
  );
}

function awsPrincipalIsWildcard(
  principal: SimIamPolicyDocumentPrincipalObject,
): boolean {
  for (const [principalType, value] of Object.entries(principal)) {
    if (principalType.toLowerCase() !== "aws") {
      continue;
    }

    if (typeof value === "string" ? value === "*" : value.includes("*")) {
      return true;
    }
  }

  return false;
}

import type {
  SimIamPolicyDocumentPrincipal,
  SimIamPolicyDocumentPrincipalObject,
  SimIamPolicyDocumentStatement,
} from "../../iam/policy/sim-iam-policy.js";

/**
 * Classifies matching Role trust-policy grants as direct principal grants or
 * AWS Account delegation.
 *
 * This distinction affects whether an IAM User needs a separate identity-policy
 * Allow for sts:AssumeRole:
 *
 * - a trust statement naming a principal directly grants that principal access;
 * - a bare Account ID or Account root ARN delegates authorization to that Account,
 *   so the caller must also have an identity-policy Allow.
 *
 * Statements supplied to this class have already matched the caller, action,
 * resource, and conditions during IAM policy evaluation. This class therefore
 * examines only the Principal representation that produced the matching grant.
 */
export class AssumeRoleTrustGrantClassifier {
  /**
   * Whether any matching trust-policy statement grants access directly.
   *
   * Multiple statements use union semantics. One direct grant is sufficient even
   * when another matching statement delegates authorization to an Account.
   */
  hasDirectPrincipalGrant(
    statements: readonly SimIamPolicyDocumentStatement[],
  ): boolean {
    return statements.some((statement) =>
      this.statementGrantsPrincipalDirectly(statement),
    );
  }

  /**
   * Classify one matching trust-policy Allow statement.
   *
   * A matching NotPrincipal statement applies directly to every principal it did
   * not exclude. A Principal statement is direct when at least one matching AWS
   * principal value is not an Account delegation form.
   */
  private statementGrantsPrincipalDirectly(
    statement: SimIamPolicyDocumentStatement,
  ): boolean {
    if (statement.NotPrincipal !== undefined) {
      return true;
    }

    if (statement.Principal === undefined) {
      return false;
    }

    return this.awsPrincipalValues(statement.Principal).some(
      (principal) => !this.isAccountDelegation(principal),
    );
  }

  /**
   * Normalize the AWS values from each supported Principal representation.
   *
   * String and array forms represent AWS principals directly. Principal objects
   * group values by principal type, so only their AWS entry is relevant when
   * classifying an ARN-based caller.
   */
  private awsPrincipalValues(
    principal: SimIamPolicyDocumentPrincipal,
  ): readonly string[] {
    if (typeof principal === "string") {
      return [principal];
    }

    /* v8 ignore if */
    if (!this.isPrincipalObject(principal)) {
      return principal;
    }

    const awsPrincipal = principal["AWS"];
    /* v8 ignore if */
    if (awsPrincipal === undefined) {
      return [];
    }

    return typeof awsPrincipal === "string" ? [awsPrincipal] : awsPrincipal;
  }

  /**
   * Distinguish a principal-type object from a readonly principal array.
   *
   * Array.isArray alone does not narrow readonly arrays correctly in this union,
   * so this predicate records the object branch explicitly for TypeScript.
   */
  private isPrincipalObject(
    principal: SimIamPolicyDocumentPrincipal,
  ): principal is SimIamPolicyDocumentPrincipalObject {
    return typeof principal === "object" && !Array.isArray(principal);
  }

  /**
   * Recognize the two Principal forms that delegate trust to an AWS Account.
   *
   * A bare 12-digit Account ID and its Account root ARN have equivalent
   * delegation semantics. Other values, including a specific IAM User ARN and
   * the wildcard principal, are classified as direct grants.
   */
  private isAccountDelegation(principal: string): boolean {
    return (
      /^\d{12}$/u.test(principal) ||
      /^arn:aws:iam::\d{12}:root$/u.test(principal)
    );
  }
}

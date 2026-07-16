import type { SimIamPolicyDocumentPrincipal } from "../../policy/sim-iam-policy.js";
import type { SimIamParsedPolicyStatement } from "../../policy/parse/sim-iam-doc-parser.js";
import type {
  SimIamAuthZContext,
  SimIamAuthZPolicySource,
} from "../context/sim-iam-auth-z-context.js";
import { simIamWildcardMatch } from "../sim-iam-wildcard.js";

/**
 * Matches the principal portion of an IAM policy statement.
 *
 * Principal matching has different rules depending on the policy source:
 *
 * - identity policies must not contain Principal or NotPrincipal;
 * - resource and trust policies must identify the caller through Principal, or
 *   exclude the caller through NotPrincipal;
 * - Principal may be a string, an array, or an object grouped by principal type;
 * - AWS account IDs and account-root ARNs grant access to authenticated
 *   principals belonging to the referenced account.
 *
 * Keeping these rules in one collaborator prevents statement matching from
 * mixing principal parsing concerns with Action, Resource, and Condition logic.
 */
export class SimIamPolicyPrincipalMatcher {
  constructor(private readonly context: SimIamAuthZContext) {}

  /**
   * Check whether the statement's principal constraint applies to the caller.
   *
   * Identity policies are associated with their identity by the surrounding
   * authorization flow, so Principal and NotPrincipal are rejected.
   *
   * Resource and trust policies require Principal or NotPrincipal because the
   * policy must state which callers it applies to.
   */
  matches(
    policy: SimIamAuthZPolicySource,
    statement: SimIamParsedPolicyStatement,
  ): boolean {
    if (policy.sourceType !== "resource" && policy.sourceType !== "trust") {
      return (
        statement.principal === undefined &&
        statement.notPrincipal === undefined
      );
    }

    if (statement.principal !== undefined) {
      return this.valueMatches(statement.principal);
    }

    if (statement.notPrincipal !== undefined) {
      return !this.valueMatches(statement.notPrincipal);
    }

    return false;
  }

  /**
   * Check each Principal representation supported by the parsed policy model.
   *
   * Arrays use logical OR semantics. Principal objects are evaluated according
   * to their principal category so AWS values match caller ARNs and account
   * delegation, while Service values match service principals.
   */
  private valueMatches(principal: SimIamPolicyDocumentPrincipal): boolean {
    if (typeof principal === "string") {
      return this.awsPatternMatches(principal);
    }

    if (Array.isArray(principal)) {
      return principal.some((value: string): boolean =>
        this.awsPatternMatches(value),
      );
    }

    return Object.entries(principal).some(([principalType, values]) => {
      const patterns = typeof values === "string" ? [values] : values;

      if (principalType === "AWS") {
        return patterns.some((pattern) => this.awsPatternMatches(pattern));
      }

      /* v8 ignore if -- service principals not yet fully supported */
      if (principalType === "Service") {
        return patterns.some((pattern) => this.servicePatternMatches(pattern));
      }

      return false;
    });
  }

  /**
   * Compare an AWS principal pattern with the resolved caller.
   *
   * The wildcard matches both authenticated and anonymous requests. Other AWS
   * forms require an ARN-based caller. Account delegation forms compare against
   * the account ID derived by the caller resolver.
   */
  private awsPatternMatches(pattern: string): boolean {
    if (pattern === "*") {
      return true;
    }

    const caller = this.context.caller;
    if (caller.arn === undefined) {
      return false;
    }

    const delegatedAccountId = this.delegatedAccountId(pattern);

    if (delegatedAccountId !== undefined) {
      return caller.accountId === delegatedAccountId;
    }

    return simIamWildcardMatch(pattern, caller.arn, {
      caseSensitive: true,
    });
  }

  /**
   * Compare a service principal pattern with the resolved caller.
   */
  private servicePatternMatches(pattern: string): boolean {
    /* v8 ignore next -- service principals not yet fully supported */
    const service = this.context.caller.service;

    /* v8 ignore next -- service principals not yet fully supported */
    return (
      service !== undefined &&
      simIamWildcardMatch(pattern, service, {
        caseSensitive: true,
      })
    );
  }

  /**
   * Return the account ID represented by an account delegation principal.
   *
   * IAM supports both a bare 12-digit account ID and the corresponding account
   * root ARN.
   */
  private delegatedAccountId(pattern: string): string | undefined {
    if (/^\d{12}$/u.test(pattern)) {
      return pattern;
    }

    const match = /^arn:aws:iam::(\d{12}):root$/u.exec(pattern);
    return match?.[1];
  }
}

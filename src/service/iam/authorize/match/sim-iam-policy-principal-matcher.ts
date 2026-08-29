import type { SimIamPolicyDocumentPrincipal } from "../../policy/sim-iam-policy.js";
import type { SimIamParsedPolicyStatement } from "../../policy/parse/sim-iam-document-parser.js";
import type {
  SimIamAuthZContext,
  SimIamAuthZPolicySource,
} from "../context/sim-iam-auth-z-context.js";
import { simIamWildcardMatch } from "../sim-iam-wildcard.js";
import { SimIamPrincipalMatch } from "./sim-iam-principal-match.js";

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
  ): SimIamPrincipalMatch {
    if (policy.sourceType !== "resource" && policy.sourceType !== "trust") {
      return SimIamPrincipalMatch.direct().when(
        statement.principal === undefined &&
          statement.notPrincipal === undefined,
      );
    }

    if (statement.principal !== undefined) {
      return this.valueMatches(statement.principal);
    }

    if (statement.notPrincipal !== undefined) {
      // Leaving the caller out of the exclusion admits it without naming it,
      // in the way a wildcard principal does.
      return SimIamPrincipalMatch.everyone().when(
        !this.valueMatches(statement.notPrincipal).matched,
      );
    }

    return SimIamPrincipalMatch.none();
  }

  /**
   * Check each Principal representation supported by the parsed policy model.
   *
   * Arrays use logical OR semantics. Principal objects are evaluated according
   * to their principal category so AWS values match caller ARNs and account
   * delegation, while Service values match service principals.
   */
  private valueMatches(
    principal: SimIamPolicyDocumentPrincipal,
  ): SimIamPrincipalMatch {
    if (typeof principal === "string") {
      return this.awsPatternMatches(principal);
    }

    if (Array.isArray(principal)) {
      return this.firstMatch(principal, (value: string) =>
        this.awsPatternMatches(value),
      );
    }

    return this.firstMatch(Object.entries(principal), ([type, values]) => {
      const patterns = typeof values === "string" ? [values] : values;

      if (type === "AWS") {
        return this.firstMatch(patterns, (pattern) =>
          this.awsPatternMatches(pattern),
        );
      }

      if (type === "Service") {
        return this.firstMatch(patterns, (pattern) =>
          this.servicePatternMatches(pattern),
        );
      }

      return SimIamPrincipalMatch.none();
    });
  }

  /**
   * The winning match among alternatives, since Principal lists are an OR.
   */
  private firstMatch<T>(
    values: readonly T[],
    match: (value: T) => SimIamPrincipalMatch,
  ): SimIamPrincipalMatch {
    return SimIamPrincipalMatch.first(values.map((value) => match(value)));
  }

  /**
   * Compare an AWS principal pattern with the resolved caller.
   *
   * The wildcard matches both authenticated and anonymous requests, and names
   * neither. Other AWS forms require an ARN-based caller. Account delegation
   * forms compare against the account ID derived by the caller resolver. An
   * ARN carrying a wildcard of its own admits a set of principals without
   * naming one, so it counts as a match on the same terms as `*`. Real IAM
   * accepts no wildcard inside a Principal ARN at all.
   *
   * A pattern is compared against two ARNs, because an assumed-role session
   * has two. The session ARN is the caller, and the Role behind it is the
   * identity whose policies apply. AWS matches a policy naming either one, and
   * recommends naming the Role. The two ARNs are the same for every caller
   * that is not a session, so one comparison happens in that case.
   */
  private awsPatternMatches(pattern: string): SimIamPrincipalMatch {
    if (pattern === "*") {
      return SimIamPrincipalMatch.everyone();
    }

    const caller = this.context.caller;
    if (caller.arn === undefined) {
      return SimIamPrincipalMatch.none();
    }

    const delegatedAccountId = this.delegatedAccountId(pattern);

    if (delegatedAccountId !== undefined) {
      return SimIamPrincipalMatch.accountDelegation().when(
        caller.accountId === delegatedAccountId,
      );
    }

    return this.arnPatternMatch(pattern).when(
      this.arnMatches(pattern, caller.arn) ||
        this.arnMatches(pattern, caller.identityPolicyArn),
    );
  }

  /**
   * The kind of match an ARN principal pattern makes, by whether it names one
   * principal or admits a set of them.
   */
  private arnPatternMatch(pattern: string): SimIamPrincipalMatch {
    return pattern.includes("*") || pattern.includes("?")
      ? SimIamPrincipalMatch.everyone()
      : SimIamPrincipalMatch.direct();
  }

  /**
   * Whether a principal pattern names one of the caller's ARNs.
   */
  private arnMatches(pattern: string, arn: string | undefined): boolean {
    return (
      arn !== undefined &&
      simIamWildcardMatch(pattern, arn, { caseSensitive: true })
    );
  }

  /**
   * Compare a service principal pattern with the resolved caller.
   *
   * A service principal has no ARN and no Account, so this is a direct grant
   * or nothing: there is no Account for a statement to delegate to. It is what
   * admits an API Gateway integration invoking a Lambda function.
   */
  private servicePatternMatches(pattern: string): SimIamPrincipalMatch {
    const service = this.context.caller.service;

    return SimIamPrincipalMatch.direct().when(
      service !== undefined &&
        simIamWildcardMatch(pattern, service, {
          caseSensitive: true,
        }),
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

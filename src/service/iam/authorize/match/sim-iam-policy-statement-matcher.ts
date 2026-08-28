import type {
  SimIamAuthZContext,
  SimIamAuthZPolicySource,
} from "../context/sim-iam-auth-z-context.js";
import type { SimIamParsedPolicyStatement } from "../../policy/parse/sim-iam-document-parser.js";
import { simIamWildcardMatch } from "../sim-iam-wildcard.js";
import { SimIamPolicyConditionMatcher } from "./condition/sim-iam-policy-condition-matcher.js";
import { SimIamPolicyPrincipalMatcher } from "./sim-iam-policy-principal-matcher.js";
import { SimIamPrincipalMatch } from "./sim-iam-principal-match.js";
import { SimIamUnevaluatedStatements } from "../unevaluated/sim-iam-unevaluated-statements.js";

/**
 * Matches one parsed IAM policy statement against one authorization request.
 *
 * This class owns the statement-level matching rules so
 * `SimIamPolicyDecision` can stay focused on policy iteration and final
 * Deny/Allow/ImplicitDeny aggregation.
 *
 * Principal and NotPrincipal evaluation is delegated to
 * `SimIamPolicyPrincipalMatcher`, which owns the policy-source rules, supported
 * Principal shapes, and AWS account delegation forms.
 *
 * The matcher coordinates:
 *
 * - Principal and NotPrincipal;
 * - Action and NotAction;
 * - Resource and NotResource;
 * - supported IAM string conditions.
 *
 * One matcher reads every policy of one request, and it is also where the
 * statements the simulator could not evaluate are collected. A statement is
 * recorded only once everything else about it has matched. Each entry is a
 * statement that would have applied to this request had its condition been
 * readable.
 */
export class SimIamPolicyStatementMatcher {
  private readonly conditionMatcher: SimIamPolicyConditionMatcher;
  private readonly principalMatcher: SimIamPolicyPrincipalMatcher;
  private readonly unevaluated = new SimIamUnevaluatedStatements();

  constructor(private readonly context: SimIamAuthZContext) {
    this.conditionMatcher = new SimIamPolicyConditionMatcher(
      context.conditionContext,
    );
    this.principalMatcher = new SimIamPolicyPrincipalMatcher(context);
  }

  /**
   * The statements read so far that the simulator could not evaluate.
   */
  get unevaluatedStatements(): SimIamUnevaluatedStatements {
    return this.unevaluated;
  }

  /**
   * Check whether a parsed statement applies to the current request.
   *
   * Each statement section must match. The short-circuit evaluation also avoids
   * evaluating later sections after an earlier constraint has rejected the
   * statement.
   */
  matches(
    policy: SimIamAuthZPolicySource,
    statement: SimIamParsedPolicyStatement,
  ): SimIamPrincipalMatch {
    const principal = this.principalMatcher.matches(policy, statement);

    if (
      !principal.matched ||
      !this.actionMatches(statement) ||
      !this.resourceMatches(policy, statement)
    ) {
      return SimIamPrincipalMatch.none();
    }

    return principal.when(this.conditionMatches(policy, statement));
  }

  /**
   * Check the statement's condition block, recording it as unevaluated where
   * an operator stopped the simulator reading it.
   */
  private conditionMatches(
    policy: SimIamAuthZPolicySource,
    statement: SimIamParsedPolicyStatement,
  ): boolean {
    const condition = this.conditionMatcher.matches(statement.condition);

    for (const operator of condition.unsupportedOperators) {
      this.unevaluated.record(
        policy,
        statement.source,
        `unsupported condition operator ${operator}`,
      );
    }

    return condition.matched;
  }

  /**
   * Check Action or NotAction against the requested IAM action.
   *
   * AWS action names are case-insensitive, so wildcard matching follows that
   * behavior. The parser guarantees one of Action or NotAction exists; the final
   * throw protects future parser changes from producing invalid statements.
   */
  private actionMatches(statement: SimIamParsedPolicyStatement): boolean {
    if (statement.actions !== undefined) {
      return statement.actions.some((pattern) =>
        simIamWildcardMatch(pattern, this.context.action, {
          caseSensitive: false,
        }),
      );
    }

    if (statement.notActions !== undefined) {
      return statement.notActions.every(
        (pattern) =>
          !simIamWildcardMatch(pattern, this.context.action, {
            caseSensitive: false,
          }),
      );
    }

    /* v8 ignore next -- defensive diagnostic error */
    throw new TypeError(
      "IAM policy statement must define either Action or NotAction",
    );
  }

  /**
   * Check Resource or NotResource against the requested resource ARN.
   *
   * Resource ARNs are matched case-sensitively. This mirrors IAM's ARN matching
   * behavior and prevents policies from matching resources that differ only by
   * case.
   */
  private resourceMatches(
    policy: SimIamAuthZPolicySource,
    statement: SimIamParsedPolicyStatement,
  ): boolean {
    if (statement.resources !== undefined) {
      return statement.resources.some((pattern) =>
        simIamWildcardMatch(pattern, this.context.resource, {
          caseSensitive: true,
        }),
      );
    }

    if (statement.notResources !== undefined) {
      return statement.notResources.every(
        (pattern) =>
          !simIamWildcardMatch(pattern, this.context.resource, {
            caseSensitive: true,
          }),
      );
    }

    return policy.sourceType === "trust";
  }
}

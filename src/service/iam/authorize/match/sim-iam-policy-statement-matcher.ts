import type { SimIamPolicyDocumentPrincipal } from "../../policy/sim-iam-policy.js";
import type {
  SimIamAuthZContext,
  SimIamAuthZPolicySource,
} from "../context/sim-iam-auth-z-context.js";
import type { SimIamParsedPolicyStatement } from "../../policy/parse/sim-iam-doc-parser.js";
import { simIamWildcardMatch } from "../sim-iam-wildcard.js";

/**
 * Matches one parsed IAM policy statement against one authorization request.
 *
 * This class owns the statement-level matching rules so
 * `SimIamPolicyDecision` can stay focused on policy iteration and final
 * Deny/Allow/ImplicitDeny aggregation.
 *
 * The matcher currently covers the IAM dimensions supported by the simulator:
 *
 * - Principal and NotPrincipal for resource policies;
 * - Action and NotAction;
 * - Resource and NotResource.
 *
 * Conditions are not evaluated yet. A statement with a Condition is treated as
 * non-matching so the simulator does not grant access from a statement whose
 * condition semantics it cannot prove.
 */
export class SimIamPolicyStatementMatcher {
  constructor(private readonly context: SimIamAuthZContext) {}

  /**
   * Check whether a parsed statement applies to the current request.
   */
  matches(
    policy: SimIamAuthZPolicySource,
    statement: SimIamParsedPolicyStatement,
  ): boolean {
    /* v8 ignore if -- policy conditions are TODO */
    if (statement.condition !== undefined) {
      return false;
    }

    return (
      this.principalMatches(policy, statement) &&
      this.actionMatches(statement) &&
      this.resourceMatches(statement)
    );
  }

  /**
   * Check the principal part of a statement.
   *
   * Identity policies do not carry Principal or NotPrincipal because they are
   * already attached to the caller identity. Resource policies must name the
   * caller with Principal, or exclude the caller with NotPrincipal.
   */
  private principalMatches(
    policy: SimIamAuthZPolicySource,
    statement: SimIamParsedPolicyStatement,
  ): boolean {
    if (policy.sourceType !== "resource") {
      return (
        statement.principal === undefined &&
        statement.notPrincipal === undefined
      );
    }

    if (statement.principal !== undefined) {
      return this.principalValueMatches(statement.principal);
    }

    if (statement.notPrincipal !== undefined) {
      return !this.principalValueMatches(statement.notPrincipal);
    }

    return false;
  }

  /**
   * Check every Principal shape supported by the parsed policy model.
   *
   * IAM allows Principal to be a string, an array, or an object keyed by
   * principal type. The simulator currently recognizes AWS and Service
   * principal objects because those are the forms used by supported services.
   */
  private principalValueMatches(
    principal: SimIamPolicyDocumentPrincipal,
  ): boolean {
    if (typeof principal === "string") {
      return this.principalPatternMatches(principal);
    }

    if (Array.isArray(principal)) {
      return principal.some((value: string): boolean =>
        this.principalPatternMatches(value),
      );
    }

    return Object.entries(principal).some(([principalType, values]) => {
      if (principalType !== "AWS" && principalType !== "Service") {
        return false;
      }

      if (typeof values === "string") {
        return this.principalPatternMatches(values);
      }

      return values.some((value) => this.principalPatternMatches(value));
    });
  }

  /**
   * Match a single principal pattern against the caller ARN.
   *
   * The wildcard principal `*` matches anonymous and signed requests. Any other
   * principal pattern requires a caller ARN because there is no stable value to
   * compare when the request has no caller principal.
   */
  private principalPatternMatches(pattern: string): boolean {
    if (pattern === "*") {
      return true;
    }

    if (this.context.callerPrincipal?.arn === undefined) {
      return false;
    }

    return simIamWildcardMatch(pattern, this.context.callerPrincipal.arn, {
      caseSensitive: true,
    });
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
      return !statement.notActions.some((pattern) =>
        simIamWildcardMatch(pattern, this.context.action, {
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
  private resourceMatches(statement: SimIamParsedPolicyStatement): boolean {
    if (statement.resources !== undefined) {
      return statement.resources.some((pattern) =>
        simIamWildcardMatch(pattern, this.context.resource, {
          caseSensitive: true,
        }),
      );
    }

    if (statement.notResources !== undefined) {
      return !statement.notResources.some((pattern) =>
        simIamWildcardMatch(pattern, this.context.resource, {
          caseSensitive: true,
        }),
      );
    }

    /* v8 ignore next -- defensive diagnostic error */
    throw new TypeError(
      "IAM policy statement must define either Resource or NotResource",
    );
  }
}

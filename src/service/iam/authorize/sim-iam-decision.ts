import type { SimIamPolicyDocumentStatement } from "../policy/sim-iam-policy.js";
import type { SimIamAuthZContext } from "./context/sim-iam-auth-z-context.js";
import {
  SimIamPolicyDocumentParser,
  type SimIamParsedPolicyStatement,
} from "../policy/parse/sim-iam-doc-parser.js";
import { simIamWildcardMatch } from "./sim-iam-wildcard.js";

export const SimIamPolicyDecisionValue = {
  ExplicitDeny: "ExplicitDeny",
  Allow: "Allow",
  ImplicitDeny: "ImplicitDeny",
} as const;

export type SimIamPolicyDecisionValue =
  (typeof SimIamPolicyDecisionValue)[keyof typeof SimIamPolicyDecisionValue];

// TODO: resource-based policies

/**
 * Decision for one simulated IAM policy authorization attempt.
 *
 * This evaluates already-discovered policy documents. It does not fetch
 * attached policies, apply trust policy semantics, evaluate permissions
 * boundaries, or enforce service command access.
 */
export class SimIamPolicyDecision {
  private readonly request: SimIamAuthZContext;
  private readonly policyDocumentParser: SimIamPolicyDocumentParser;
  private readonly explicitDenyStatementRecords: SimIamPolicyDocumentStatement[] =
    [];
  private readonly allowStatementRecords: SimIamPolicyDocumentStatement[] = [];

  constructor(
    request: SimIamAuthZContext,
    policyDocumentParser: SimIamPolicyDocumentParser = new SimIamPolicyDocumentParser(),
  ) {
    this.request = request;
    this.policyDocumentParser = policyDocumentParser;

    this.evaluate();
  }

  /**
   * Final IAM decision value.
   */
  get value(): SimIamPolicyDecisionValue {
    if (this.explicitDenyStatementRecords.length > 0) {
      return SimIamPolicyDecisionValue.ExplicitDeny;
    }

    if (this.allowStatementRecords.length > 0) {
      return SimIamPolicyDecisionValue.Allow;
    }

    return SimIamPolicyDecisionValue.ImplicitDeny;
  }

  /**
   * Whether the request is allowed.
   */
  get isAllowed(): boolean {
    return this.value === SimIamPolicyDecisionValue.Allow;
  }

  /**
   * Whether the request is denied either explicitly or implicitly.
   */
  get isDenied(): boolean {
    return this.value !== SimIamPolicyDecisionValue.Allow;
  }

  /**
   * Whether the request is denied by a matching Deny statement.
   */
  get isExplicitDeny(): boolean {
    return this.value === SimIamPolicyDecisionValue.ExplicitDeny;
  }

  /**
   * Whether the request is denied because no Allow statement matched.
   */
  get isImplicitDeny(): boolean {
    return this.value === SimIamPolicyDecisionValue.ImplicitDeny;
  }

  /**
   * Matching explicit Deny statements.
   */
  get explicitDenyStatements(): readonly SimIamPolicyDocumentStatement[] {
    return this.explicitDenyStatementRecords;
  }

  /**
   * Matching Allow statements.
   */
  get allowStatements(): readonly SimIamPolicyDocumentStatement[] {
    return this.allowStatementRecords;
  }

  private evaluate(): void {
    for (const policy of this.request.identityPolicies) {
      const parsedPolicy = this.policyDocumentParser.parse(policy.document);

      for (const statement of parsedPolicy.statements) {
        if (!this.statementMatches(statement)) {
          continue;
        }

        if (statement.effect === "Deny") {
          this.explicitDenyStatementRecords.push(statement.source);
          continue;
        }

        this.allowStatementRecords.push(statement.source);
      }
    }
  }

  private statementMatches(statement: SimIamParsedPolicyStatement): boolean {
    /* v8 ignore if -- policy conditions are TODO */
    if (statement.condition !== undefined) {
      return false;
    }

    /* v8 ignore if -- resource-based policies are TODO */
    if (
      statement.principal !== undefined ||
      statement.notPrincipal !== undefined
    ) {
      return false;
    }

    return this.actionMatches(statement) && this.resourceMatches(statement);
  }

  private actionMatches(statement: SimIamParsedPolicyStatement): boolean {
    if (statement.actions !== undefined) {
      return statement.actions.some((pattern) =>
        simIamWildcardMatch(pattern, this.request.action, {
          caseSensitive: false,
        }),
      );
    }

    if (statement.notActions !== undefined) {
      return !statement.notActions.some((pattern) =>
        simIamWildcardMatch(pattern, this.request.action, {
          caseSensitive: false,
        }),
      );
    }

    /* v8 ignore next -- defensive diagnostic error */
    throw new TypeError(
      "IAM policy statement must define either Action or NotAction",
    );
  }

  private resourceMatches(statement: SimIamParsedPolicyStatement): boolean {
    if (statement.resources !== undefined) {
      return statement.resources.some((pattern) =>
        simIamWildcardMatch(pattern, this.request.resource, {
          caseSensitive: true,
        }),
      );
    }

    if (statement.notResources !== undefined) {
      return !statement.notResources.some((pattern) =>
        simIamWildcardMatch(pattern, this.request.resource, {
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

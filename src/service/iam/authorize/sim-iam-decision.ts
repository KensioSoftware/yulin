import type { SimIamPolicyDocumentStatement } from "../policy/sim-iam-policy.js";
import type {
  SimIamAuthZContext,
  SimIamAuthZPolicySource,
} from "./context/sim-iam-auth-z-context.js";
import { SimIamPolicyDocumentParser } from "../policy/parse/sim-iam-document-parser.js";
import { SimIamPolicyStatementMatcher } from "./match/sim-iam-policy-statement-matcher.js";
import type { SimAwsResolvedCaller } from "../../aws/caller/sim-aws-caller-resolver.js";

export const SimIamPolicyDecisionValue = {
  ExplicitDeny: "ExplicitDeny",
  Allow: "Allow",
  ImplicitDeny: "ImplicitDeny",
} as const;

export type SimIamPolicyDecisionValue =
  (typeof SimIamPolicyDecisionValue)[keyof typeof SimIamPolicyDecisionValue];

/**
 * Decision for one simulated IAM policy authorization attempt.
 *
 * This evaluates already-discovered identity and resource policy documents. It
 * does not fetch attached policies itself, apply trust policy semantics,
 * evaluate permissions boundaries, evaluate SCPs, or enforce service command
 * access.
 *
 * The simulator currently models the common IAM authorization union:
 *
 * - an explicit Deny in any evaluated policy wins;
 * - an Allow in an identity policy or resource policy allows the request;
 * - otherwise the request is implicitly denied.
 *
 * Resource policies are expected to be supplied by the service that owns the
 * target resource.
 */
export class SimIamPolicyDecision {
  private readonly request: SimIamAuthZContext;
  private readonly policyDocumentParser: SimIamPolicyDocumentParser;
  private readonly statementMatcher: SimIamPolicyStatementMatcher;
  private readonly explicitDenyStatementRecords: SimIamPolicyDocumentStatement[] =
    [];
  private readonly allowStatementRecords: SimIamPolicyDocumentStatement[] = [];
  private readonly trustAllowStatementRecords: SimIamPolicyDocumentStatement[] =
    [];

  constructor(
    request: SimIamAuthZContext,
    policyDocumentParser: SimIamPolicyDocumentParser = new SimIamPolicyDocumentParser(),
  ) {
    this.request = request;
    this.policyDocumentParser = policyDocumentParser;
    this.statementMatcher = new SimIamPolicyStatementMatcher(request);

    this.evaluate();
  }

  /**
   * Resolved caller against which this authorization decision was evaluated.
   *
   * This includes IAM's default account-root caller when the authorization input
   * omitted a caller.
   */
  get caller(): SimAwsResolvedCaller {
    return this.request.caller;
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
   * Whether a matching trust-policy statement explicitly allows the request.
   *
   * An identity-policy Allow cannot substitute for the target role's trust.
   */
  get isAllowedByTrustPolicy(): boolean {
    return this.trustAllowStatementRecords.length > 0;
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

  /**
   * Matching Allow statements originating from trust policies.
   */
  get trustAllowStatements(): readonly SimIamPolicyDocumentStatement[] {
    return this.trustAllowStatementRecords;
  }

  private evaluate(): void {
    for (const policy of [
      ...this.request.identityPolicies,
      ...this.request.resourcePolicies,
    ]) {
      this.evaluatePolicy(policy);
    }
  }

  private evaluatePolicy(policy: SimIamAuthZPolicySource): void {
    const parsedPolicy = this.policyDocumentParser.parse(policy.document);

    for (const statement of parsedPolicy.statements) {
      if (!this.statementMatcher.matches(policy, statement)) {
        continue;
      }

      if (statement.effect === "Deny") {
        this.explicitDenyStatementRecords.push(statement.source);
        continue;
      }

      this.allowStatementRecords.push(statement.source);

      if (policy.sourceType === "trust") {
        this.trustAllowStatementRecords.push(statement.source);
      }
    }
  }
}

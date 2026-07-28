import type { SimIamPolicyDocumentStatement } from "../policy/sim-iam-policy.js";
import type {
  SimIamAuthZContext,
  SimIamAuthZPolicySource,
} from "./context/sim-iam-auth-z-context.js";
import { SimIamPolicyDocumentParser } from "../policy/parse/sim-iam-document-parser.js";
import { SimIamPolicyStatementMatcher } from "./match/sim-iam-policy-statement-matcher.js";
import type { SimAwsResolvedCaller } from "../../aws/caller/sim-aws-caller-resolver.js";
import { SimIamAllowStatements } from "./allow/sim-iam-allow-statements.js";

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
 * The simulator currently models the common IAM authorization rules:
 *
 * - an explicit Deny in any evaluated policy wins;
 * - the Allows found must satisfy the request's allow requirement, which is
 *   either side within one Account and both sides across Accounts;
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
  private readonly allows = new SimIamAllowStatements();

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

    if (this.request.allowRequirement.isSatisfiedBy(this.allows.sides)) {
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
    return this.allows.trust.length > 0;
  }

  /**
   * Matching explicit Deny statements.
   */
  get explicitDenyStatements(): readonly SimIamPolicyDocumentStatement[] {
    return this.explicitDenyStatementRecords;
  }

  /**
   * Matching Allow statements, from both policy sides.
   *
   * A statement appearing here did match the request. It does not follow that
   * the request was allowed: a cross-Account request needs a matching Allow
   * from each side.
   */
  get allowStatements(): readonly SimIamPolicyDocumentStatement[] {
    return this.allows.all;
  }

  /**
   * Matching Allow statements from identity-based policies.
   */
  get identityAllowStatements(): readonly SimIamPolicyDocumentStatement[] {
    return this.allows.identity;
  }

  /**
   * Matching Allow statements from resource-based policies.
   */
  get resourceAllowStatements(): readonly SimIamPolicyDocumentStatement[] {
    return this.allows.resource;
  }

  /**
   * Matching Allow statements originating from trust policies.
   */
  get trustAllowStatements(): readonly SimIamPolicyDocumentStatement[] {
    return this.allows.trust;
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
      const principal = this.statementMatcher.matches(policy, statement);

      if (!principal.matched) {
        continue;
      }

      if (statement.effect === "Deny") {
        this.explicitDenyStatementRecords.push(statement.source);
        continue;
      }

      this.allows.record(policy, statement.source, principal);
    }
  }
}

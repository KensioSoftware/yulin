import type { SimIamPolicyDocumentStatement } from "../policy/sim-iam-policy.js";
import type { SimIamAuthZContext } from "./context/sim-iam-auth-z-context.js";
import { SimIamPolicyDocumentParser } from "../policy/parse/sim-iam-document-parser.js";
import { SimIamPolicyStatementMatcher } from "./match/sim-iam-policy-statement-matcher.js";
import type { SimAwsResolvedCaller } from "../../aws/caller/sim-aws-caller-resolver.js";
import { SimIamPolicyEvaluation } from "./allow/sim-iam-policy-evaluation.js";
import { SimIamScpGate } from "./scp/sim-iam-scp-gate.js";
import { SimIamPolicyDecisionValue } from "./sim-iam-decision-value.js";

export { SimIamPolicyDecisionValue } from "./sim-iam-decision-value.js";

/**
 * Decision for one simulated IAM policy authorization attempt.
 *
 * This evaluates already-discovered identity, resource, and service control
 * policy documents. It does not fetch attached policies itself, apply trust
 * policy semantics, evaluate permissions boundaries, or enforce service
 * command access.
 *
 * The simulator currently models the common IAM authorization rules:
 *
 * - an explicit Deny in any evaluated policy wins;
 * - the caller's Account has to get past its service control policies, which
 *   filter permissions and grant none;
 * - the Allows found must satisfy the request's allow requirement, which is
 *   either side within one Account and both sides across Accounts;
 * - otherwise the request is implicitly denied.
 *
 * Reading the policies belongs to SimIamPolicyEvaluation for the two sides
 * that can allow, and to SimIamScpGate for the Account boundary. This class
 * combines what they found.
 *
 * Resource policies are expected to be supplied by the service that owns the
 * target resource.
 */
export class SimIamPolicyDecision {
  private readonly request: SimIamAuthZContext;
  private readonly policies: SimIamPolicyEvaluation;
  private readonly scpGate: SimIamScpGate;

  constructor(
    request: SimIamAuthZContext,
    policyDocumentParser: SimIamPolicyDocumentParser = new SimIamPolicyDocumentParser(),
  ) {
    const statementMatcher = new SimIamPolicyStatementMatcher(request);

    this.request = request;
    this.policies = new SimIamPolicyEvaluation({
      policies: [...request.identityPolicies, ...request.resourcePolicies],
      policyDocumentParser,
      statementMatcher,
    });
    this.scpGate = new SimIamScpGate({
      policies: request.serviceControlPolicies,
      policyDocumentParser,
      statementMatcher,
    });
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
    if (this.policies.isExplicitDeny) {
      return SimIamPolicyDecisionValue.ExplicitDeny;
    }

    if (this.scpGate.value !== undefined) {
      return this.scpGate.value;
    }

    return this.request.allowRequirement.isSatisfiedBy(this.policies.sides)
      ? SimIamPolicyDecisionValue.Allow
      : SimIamPolicyDecisionValue.ImplicitDeny;
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
    return this.policies.allowStatements.trust.length > 0;
  }

  /**
   * Matching explicit Deny statements.
   */
  get explicitDenyStatements(): readonly SimIamPolicyDocumentStatement[] {
    return this.policies.explicitDenyStatements;
  }

  /**
   * What the caller Account's service control policies said about the request.
   *
   * This is the organization's verdict on its own, apart from the identity and
   * resource sides. It reports whether the Account boundary denied the request
   * and which of its statements matched.
   */
  get serviceControlPolicy(): SimIamScpGate {
    return this.scpGate;
  }

  /**
   * How an AccessDenied error should explain this denial, where there is more
   * to say than the action and the resource.
   *
   * A service turns a denied decision into an error and passes this through,
   * so an SCP denial reads the way it does in a real account.
   */
  get denialReason(): string | undefined {
    return this.scpGate.denialReason(this.request.action);
  }

  /**
   * Matching Allow statements, from both policy sides.
   *
   * A statement appearing here did match the request. It does not follow that
   * the request was allowed: a cross-Account request needs a matching Allow
   * from each side.
   */
  get allowStatements(): readonly SimIamPolicyDocumentStatement[] {
    return this.policies.allowStatements.all;
  }

  /**
   * Matching Allow statements from identity-based policies.
   */
  get identityAllowStatements(): readonly SimIamPolicyDocumentStatement[] {
    return this.policies.allowStatements.identity;
  }

  /**
   * Matching Allow statements from resource-based policies.
   */
  get resourceAllowStatements(): readonly SimIamPolicyDocumentStatement[] {
    return this.policies.allowStatements.resource;
  }

  /**
   * Matching Allow statements originating from trust policies.
   */
  get trustAllowStatements(): readonly SimIamPolicyDocumentStatement[] {
    return this.policies.allowStatements.trust;
  }
}

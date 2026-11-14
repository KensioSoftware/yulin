import { SimIamPolicyDocumentParser } from "../../policy/parse/sim-iam-document-parser.js";
import type { SimIamPolicyStatementMatcher } from "../match/sim-iam-policy-statement-matcher.js";
import type { SimIamAuthZContext } from "../context/sim-iam-auth-z-context.js";
import type { SimIamPolicyEvaluation } from "../allow/sim-iam-policy-evaluation.js";
import type { SimIamScpGate } from "../scp/sim-iam-scp-gate.js";
import { SimIamPrincipalLimit } from "./sim-iam-principal-limit.js";

/**
 * The caller's permissions boundary and session policies, read together.
 *
 * AWS checks the boundary first and the session policies after it, so a
 * denial both would explain is put down to the boundary.
 */
export class SimIamPrincipalLimits {
  readonly permissionsBoundary: SimIamPrincipalLimit;
  readonly sessionPolicy: SimIamPrincipalLimit;
  private readonly request: SimIamAuthZContext;

  constructor(
    request: SimIamAuthZContext,
    statementMatcher: SimIamPolicyStatementMatcher,
    policyDocumentParser = new SimIamPolicyDocumentParser(),
  ) {
    this.request = request;
    this.permissionsBoundary = new SimIamPrincipalLimit({
      policyType: "permissions boundary",
      limit: request.permissionsBoundary,
      policyDocumentParser,
      statementMatcher,
    });
    this.sessionPolicy = new SimIamPrincipalLimit({
      policyType: "session policy",
      limit: request.sessionPolicy,
      policyDocumentParser,
      statementMatcher,
    });
  }

  /**
   * Whether either limit denied the request with a statement of its own.
   */
  get isExplicitDeny(): boolean {
    return this.explicitDenial !== undefined;
  }

  /**
   * Whether the Allows found satisfy the request's allow requirement once
   * these limits are applied.
   *
   * Where both limits let the request through, every Allow counts. Where
   * either allows nothing matching, only a resource-policy Allow that named
   * the caller itself or admitted everyone is left.
   */
  allowsRequest(policies: SimIamPolicyEvaluation): boolean {
    return this.request.allowRequirement.isSatisfiedBy(
      this.allow ? policies.sides : policies.unlimitedSides,
    );
  }

  /**
   * How an AccessDenied error explains a denial, where there is more to say
   * than the action and the resource.
   *
   * A Deny in an identity or resource policy needs nothing added. Otherwise
   * the reasons are tried in the order AWS evaluates the policy types: a Deny
   * in a permissions boundary or session policy, then the service control
   * policies, then a boundary or session policy that allowed nothing
   * matching.
   */
  denialReason(
    policies: SimIamPolicyEvaluation,
    scpGate: SimIamScpGate,
  ): string | undefined {
    if (policies.isExplicitDeny) {
      return undefined;
    }

    return (
      this.explicitDenial?.denialReason(this.request.action) ??
      scpGate.denialReason(this.request.action) ??
      this.implicitDenialReason(policies)
    );
  }

  /**
   * How an AWS error explains a limit that allowed nothing matching, where
   * the request would have been allowed without it.
   */
  private implicitDenialReason(
    policies: SimIamPolicyEvaluation,
  ): string | undefined {
    const allowedWithout = this.request.allowRequirement.isSatisfiedBy(
      policies.sides,
    );

    return allowedWithout && !this.allowsRequest(policies)
      ? this.limits
          .find((limit) => !limit.allows)
          ?.denialReason(this.request.action)
      : undefined;
  }

  private get allow(): boolean {
    return this.permissionsBoundary.allows && this.sessionPolicy.allows;
  }

  private get explicitDenial(): SimIamPrincipalLimit | undefined {
    return this.limits.find((limit) => limit.isExplicitDeny);
  }

  private get limits(): readonly SimIamPrincipalLimit[] {
    return [this.permissionsBoundary, this.sessionPolicy];
  }
}

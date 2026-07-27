import type { SimIamPolicyDocumentStatement } from "../../policy/sim-iam-policy.js";
import type { SimIamAuthZPolicySource } from "../context/sim-iam-auth-z-context.js";
import { SimIamAllowSides } from "./sim-iam-allow-requirement.js";

/**
 * The matching Allow statements found for one authorization, kept per side.
 *
 * Which side an Allow came from decides whether it counts: a cross-Account
 * request needs one from each. Trust policies are resource policies on an IAM
 * Role, so they count as the resource side, and are additionally kept apart for
 * the AssumeRole rule that an identity policy cannot substitute for a Role's
 * trust.
 */
export class SimIamAllowStatements {
  private readonly identityStatements: SimIamPolicyDocumentStatement[] = [];
  private readonly resourceStatements: SimIamPolicyDocumentStatement[] = [];
  private readonly trustStatements: SimIamPolicyDocumentStatement[] = [];

  /**
   * Record a matching Allow against the policy side it came from.
   */
  record(
    policy: SimIamAuthZPolicySource,
    statement: SimIamPolicyDocumentStatement,
  ): void {
    if (policy.sourceType === "trust") {
      this.trustStatements.push(statement);
    }

    this.sideStatements(policy).push(statement);
  }

  /**
   * Every matching Allow statement, identity side first.
   */
  get all(): readonly SimIamPolicyDocumentStatement[] {
    return [...this.identityStatements, ...this.resourceStatements];
  }

  /**
   * Matching Allow statements from identity-based policies.
   */
  get identity(): readonly SimIamPolicyDocumentStatement[] {
    return this.identityStatements;
  }

  /**
   * Matching Allow statements from resource-based policies.
   */
  get resource(): readonly SimIamPolicyDocumentStatement[] {
    return this.resourceStatements;
  }

  /**
   * Matching Allow statements originating from trust policies.
   */
  get trust(): readonly SimIamPolicyDocumentStatement[] {
    return this.trustStatements;
  }

  /**
   * Which sides produced a matching Allow.
   */
  get sides(): SimIamAllowSides {
    return new SimIamAllowSides({
      identity: this.identityStatements.length > 0,
      resource: this.resourceStatements.length > 0,
    });
  }

  /**
   * The list an Allow from this policy source belongs in.
   */
  private sideStatements(
    policy: SimIamAuthZPolicySource,
  ): SimIamPolicyDocumentStatement[] {
    if (policy.sourceType === "resource" || policy.sourceType === "trust") {
      return this.resourceStatements;
    }

    return this.identityStatements;
  }
}

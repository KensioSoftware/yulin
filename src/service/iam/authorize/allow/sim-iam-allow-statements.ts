import type { SimIamPolicyDocumentStatement } from "../../policy/sim-iam-policy.js";
import type { SimIamAuthZPolicySource } from "../context/sim-iam-auth-z-context.js";
import { SimIamAllowSides } from "./sim-iam-allow-requirement.js";
import type { SimIamPrincipalMatch } from "../match/sim-iam-principal-match.js";

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
  private readonly delegatedStatements: SimIamPolicyDocumentStatement[] = [];
  private readonly namingStatements: SimIamPolicyDocumentStatement[] = [];
  private readonly unlimitedStatements: SimIamPolicyDocumentStatement[] = [];

  /**
   * Record a matching Allow against the policy side it came from.
   *
   * How a resource-policy Allow came to match is kept alongside it, for the
   * rules that care. A statement can match by way of the caller's Account, by
   * naming the caller, or by admitting whoever the request came from.
   */
  record(
    policy: SimIamAuthZPolicySource,
    statement: SimIamPolicyDocumentStatement,
    principal: SimIamPrincipalMatch,
  ): void {
    if (policy.sourceType === "trust") {
      this.trustStatements.push(statement);
    }

    if (principal.isAccountDelegation) {
      this.delegatedStatements.push(statement);
    }

    if (principal.namesCaller) {
      this.namingStatements.push(statement);
    }

    if (principal.passesPrincipalLimits) {
      this.unlimitedStatements.push(statement);
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
    return this.sidesOf(this.identityStatements, this.resourceStatements);
  }

  /**
   * Which sides produced a matching Allow that a permissions boundary or
   * session policy allowing nothing leaves standing.
   *
   * The identity side is gone. A resource-policy Allow survives where it
   * named the caller itself or admitted everyone, and is dropped where it
   * reached the caller through its Role or its Account.
   */
  get unlimitedSides(): SimIamAllowSides {
    const unlimited = new Set(this.unlimitedStatements);

    return this.sidesOf(
      [],
      this.resourceStatements.filter((statement) => unlimited.has(statement)),
    );
  }

  /**
   * The sides that the given Allow statements make up.
   */
  private sidesOf(
    identity: readonly SimIamPolicyDocumentStatement[],
    resource: readonly SimIamPolicyDocumentStatement[],
  ): SimIamAllowSides {
    const delegated = new Set(this.delegatedStatements);
    const naming = new Set(this.namingStatements);

    return new SimIamAllowSides({
      identity: identity.length > 0,
      resource: resource.length > 0,
      resourceDirect: resource.some((statement) => !delegated.has(statement)),
      resourceNamesCaller: resource.some((statement) => naming.has(statement)),
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

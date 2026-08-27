import type { SimIamPolicyDocumentStatement } from "../../policy/sim-iam-policy.js";
import type { SimIamPolicyDocumentParser } from "../../policy/parse/sim-iam-document-parser.js";
import type { SimIamPolicyStatementMatcher } from "../match/sim-iam-policy-statement-matcher.js";
import type { SimIamAuthZPolicySource } from "../context/sim-iam-auth-z-context.js";
import { SimIamAllowStatements } from "./sim-iam-allow-statements.js";
import type { SimIamAllowSides } from "./sim-iam-allow-requirement.js";

interface SimIamPolicyEvaluationProperties {
  readonly policies: readonly SimIamAuthZPolicySource[];
  readonly policyDocumentParser: SimIamPolicyDocumentParser;
  readonly statementMatcher: SimIamPolicyStatementMatcher;
}

/**
 * The statements of the identity and resource policies that matched one
 * request.
 *
 * These are the two sides that can allow a request, so they are read together
 * and kept apart by side afterwards. Which of them has to allow for the
 * request to go ahead belongs to the allow requirement rather than here.
 */
export class SimIamPolicyEvaluation {
  private readonly explicitDenyStatementRecords: SimIamPolicyDocumentStatement[] =
    [];
  private readonly allows = new SimIamAllowStatements();

  constructor(properties: SimIamPolicyEvaluationProperties) {
    for (const policy of properties.policies) {
      this.evaluate(policy, properties);
    }
  }

  /**
   * Whether a matching Deny statement was found.
   */
  get isExplicitDeny(): boolean {
    return this.explicitDenyStatementRecords.length > 0;
  }

  /**
   * Matching explicit Deny statements.
   */
  get explicitDenyStatements(): readonly SimIamPolicyDocumentStatement[] {
    return this.explicitDenyStatementRecords;
  }

  /**
   * The matching Allow statements, kept per side.
   */
  get allowStatements(): SimIamAllowStatements {
    return this.allows;
  }

  /**
   * Which sides produced a matching Allow.
   */
  get sides(): SimIamAllowSides {
    return this.allows.sides;
  }

  /**
   * Record the matching statements of one policy.
   */
  private evaluate(
    policy: SimIamAuthZPolicySource,
    properties: SimIamPolicyEvaluationProperties,
  ): void {
    const parsedPolicy = properties.policyDocumentParser.parse(policy.document);

    for (const statement of parsedPolicy.statements) {
      const principal = properties.statementMatcher.matches(policy, statement);

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

import type { SimIamPolicyDocumentStatement } from "../../policy/sim-iam-policy.js";
import type { SimIamPolicyDocumentParser } from "../../policy/parse/sim-iam-document-parser.js";
import type { SimIamPolicyStatementMatcher } from "../match/sim-iam-policy-statement-matcher.js";
import type { SimIamAuthZPolicyLimit } from "../context/sim-iam-auth-z-context.js";

interface SimIamPrincipalLimitProperties {
  /**
   * The name AWS gives the policy type in an AccessDenied message, such as
   * `permissions boundary`.
   */
  readonly policyType: string;
  readonly limit: SimIamAuthZPolicyLimit;
  readonly policyDocumentParser: SimIamPolicyDocumentParser;
  readonly statementMatcher: SimIamPolicyStatementMatcher;
}

/**
 * What a permissions boundary or a session's policies say about one request.
 *
 * Both cap the permissions the caller's identity policies grant, and grant
 * nothing themselves. A matching Deny ends the request. A limit allowing
 * nothing that matches leaves the identity policies unable to allow it, along
 * with any resource policy that reached the caller through its Role or its
 * Account.
 *
 * A caller with no such limit is unrestricted by it.
 */
export class SimIamPrincipalLimit {
  private readonly policyType: string;
  private readonly applies: boolean;
  private readonly denyStatementRecords: SimIamPolicyDocumentStatement[] = [];
  private readonly allowStatementRecords: SimIamPolicyDocumentStatement[] = [];

  constructor(properties: SimIamPrincipalLimitProperties) {
    this.policyType = properties.policyType;
    this.applies = properties.limit.applies;

    for (const policy of properties.limit.sources) {
      const parsed = properties.policyDocumentParser.parse(policy.document);

      for (const statement of parsed.statements) {
        if (!properties.statementMatcher.matches(policy, statement).matched) {
          continue;
        }

        const records =
          statement.effect === "Deny"
            ? this.denyStatementRecords
            : this.allowStatementRecords;

        records.push(statement.source);
      }
    }
  }

  /**
   * Whether the caller carries this limit at all.
   */
  get isApplied(): boolean {
    return this.applies;
  }

  /**
   * Whether a statement in the limit denied the request.
   */
  get isExplicitDeny(): boolean {
    return this.denyStatementRecords.length > 0;
  }

  /**
   * Whether the limit lets the request through to the policies that grant it.
   */
  get allows(): boolean {
    return (
      !this.applies ||
      (!this.isExplicitDeny && this.allowStatementRecords.length > 0)
    );
  }

  /**
   * Matching Deny statements.
   */
  get denyStatements(): readonly SimIamPolicyDocumentStatement[] {
    return this.denyStatementRecords;
  }

  /**
   * Matching Allow statements.
   */
  get allowStatements(): readonly SimIamPolicyDocumentStatement[] {
    return this.allowStatementRecords;
  }

  /**
   * How an AWS error explains a denial this limit caused.
   */
  denialReason(action: string): string {
    return this.isExplicitDeny
      ? `with an explicit deny in a ${this.policyType}`
      : `because no ${this.policyType} allows the ${action} action`;
  }
}

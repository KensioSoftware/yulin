import type { SimIamPolicyDocumentStatement } from "../../policy/sim-iam-policy.js";
import type { SimIamPolicyDocumentParser } from "../../policy/parse/sim-iam-document-parser.js";
import type { SimIamPolicyStatementMatcher } from "../match/sim-iam-policy-statement-matcher.js";
import type {
  SimIamAuthZPolicySource,
  SimIamAuthZServiceControlPolicies,
} from "../context/sim-iam-auth-z-context.js";
import { SimIamPolicyDecisionValue } from "../sim-iam-decision-value.js";

interface SimIamScpGateProperties {
  readonly serviceControlPolicies: SimIamAuthZServiceControlPolicies;
  readonly policyDocumentParser: SimIamPolicyDocumentParser;
  readonly statementMatcher: SimIamPolicyStatementMatcher;
}

/**
 * What an Account's service control policies say about one request.
 *
 * An SCP is a filter on the permissions an Account's principals can be given.
 * It grants nothing, so this runs as a gate in front of the identity and
 * resource policy evaluation instead of contributing Allows to it. The rules
 * are the two AWS applies at the Account boundary:
 *
 * - a matching Deny in any attached policy ends the request;
 * - the attached policies have to produce a matching Allow between them.
 *
 * An Account outside any organization's reach is unrestricted, and this gate
 * stands open for it. An Account inside one that holds no policy is a
 * different case: nothing allows it anything, so the gate is shut.
 */
export class SimIamScpGate {
  private readonly applies: boolean;
  private readonly denyStatementRecords: SimIamPolicyDocumentStatement[] = [];
  private readonly allowStatementRecords: SimIamPolicyDocumentStatement[] = [];

  constructor(properties: SimIamScpGateProperties) {
    this.applies = properties.serviceControlPolicies.applies;

    for (const policy of properties.serviceControlPolicies.sources) {
      this.evaluate(policy, properties);
    }
  }

  /**
   * Whether any service control policy applied to this request at all.
   */
  get isApplied(): boolean {
    return this.applies;
  }

  /**
   * Whether an attached policy explicitly denied the request.
   */
  get isExplicitDeny(): boolean {
    return this.denyStatementRecords.length > 0;
  }

  /**
   * Whether the attached policies left the request unallowed.
   *
   * A Deny is reported by `isExplicitDeny` and leaves this false, so the two
   * name different denials and a reader can tell them apart.
   */
  get isImplicitDeny(): boolean {
    return (
      this.applies &&
      !this.isExplicitDeny &&
      this.allowStatementRecords.length === 0
    );
  }

  /**
   * Whether the service control policies denied the request either way.
   */
  get isDenied(): boolean {
    return this.isExplicitDeny || this.isImplicitDeny;
  }

  /**
   * The decision this gate forces, where it forces one.
   *
   * Undefined leaves the request to the identity and resource policies, which
   * is what an open gate means.
   */
  get value(): SimIamPolicyDecisionValue | undefined {
    if (this.isExplicitDeny) {
      return SimIamPolicyDecisionValue.ExplicitDeny;
    }

    return this.isImplicitDeny
      ? SimIamPolicyDecisionValue.ImplicitDeny
      : undefined;
  }

  /**
   * Matching Deny statements from the attached policies.
   */
  get denyStatements(): readonly SimIamPolicyDocumentStatement[] {
    return this.denyStatementRecords;
  }

  /**
   * Matching Allow statements from the attached policies.
   */
  get allowStatements(): readonly SimIamPolicyDocumentStatement[] {
    return this.allowStatementRecords;
  }

  /**
   * How an AWS error explains this denial, if this gate is what denied it.
   *
   * The wording follows the AccessDenied messages AWS returns for the two
   * cases, so a test asserting on the message reads what it would in a real
   * account.
   */
  denialReason(action: string): string | undefined {
    if (this.isExplicitDeny) {
      return "with an explicit deny in a service control policy";
    }

    if (this.isImplicitDeny) {
      return `because no service control policy allows the ${action} action`;
    }

    return undefined;
  }

  /**
   * Record the matching statements of one attached policy.
   */
  private evaluate(
    policy: SimIamAuthZPolicySource,
    properties: SimIamScpGateProperties,
  ): void {
    const parsedPolicy = properties.policyDocumentParser.parse(policy.document);

    for (const statement of parsedPolicy.statements) {
      if (!properties.statementMatcher.matches(policy, statement).matched) {
        continue;
      }

      if (statement.effect === "Deny") {
        this.denyStatementRecords.push(statement.source);
        continue;
      }

      this.allowStatementRecords.push(statement.source);
    }
  }
}

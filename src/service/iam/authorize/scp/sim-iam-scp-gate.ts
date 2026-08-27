import type { SimIamPolicyDocumentStatement } from "../../policy/sim-iam-policy.js";
import type { SimIamPolicyDocumentParser } from "../../policy/parse/sim-iam-document-parser.js";
import type { SimIamPolicyStatementMatcher } from "../match/sim-iam-policy-statement-matcher.js";
import type {
  SimIamAuthZPolicySource,
  SimIamAuthZServiceControlPolicies,
  SimIamAuthZServiceControlPolicyLevel,
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
 * are the ones AWS applies at the Account boundary:
 *
 * - a matching Deny at any level ends the request;
 * - every level between the root and the Account has to produce a matching
 *   Allow of its own.
 *
 * The second rule is what makes the levels worth keeping apart. A root
 * allowing S3 and an organizational unit allowing DynamoDB leave an Account
 * beneath them able to do neither, because each level is asked separately.
 *
 * An Account outside any organization's reach is unrestricted, and this gate
 * stands open for it. An Account inside one that holds no policy is a
 * different case: nothing allows it anything, so the gate is shut.
 */
export class SimIamScpGate {
  private readonly applies: boolean;
  private readonly denyStatementRecords: SimIamPolicyDocumentStatement[] = [];
  private readonly allowStatementRecords: SimIamPolicyDocumentStatement[] = [];
  private readonly unallowedLevelNames: string[] = [];

  constructor(properties: SimIamScpGateProperties) {
    this.applies = properties.serviceControlPolicies.applies;

    for (const level of properties.serviceControlPolicies.levels) {
      this.evaluateLevel(level, properties);
    }

    if (this.applies && properties.serviceControlPolicies.levels.length === 0) {
      this.unallowedLevelNames.push("the organization");
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
   * Whether a level left the request unallowed.
   *
   * A Deny is reported by `isExplicitDeny` and leaves this false, so the two
   * name different denials and a reader can tell them apart.
   */
  get isImplicitDeny(): boolean {
    return (
      this.applies &&
      !this.isExplicitDeny &&
      this.unallowedLevelNames.length > 0
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
   * Matching Allow statements from the attached policies, across every level.
   */
  get allowStatements(): readonly SimIamPolicyDocumentStatement[] {
    return this.allowStatementRecords;
  }

  /**
   * The levels that allowed nothing matching the request, root first.
   *
   * This is what a test reads to find which node in the organization is in the
   * way, which is the part of an SCP denial AWS makes hardest to work out.
   */
  get unallowedLevels(): readonly string[] {
    return this.unallowedLevelNames;
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
   * Record what one level of the organization said.
   */
  private evaluateLevel(
    level: SimIamAuthZServiceControlPolicyLevel,
    properties: SimIamScpGateProperties,
  ): void {
    let allowed = false;

    for (const policy of level.sources) {
      allowed = this.evaluatePolicy(policy, properties) || allowed;
    }

    if (!allowed) {
      this.unallowedLevelNames.push(level.nodeName);
    }
  }

  /**
   * Record the matching statements of one attached policy, and say whether it
   * allowed the request.
   */
  private evaluatePolicy(
    policy: SimIamAuthZPolicySource,
    properties: SimIamScpGateProperties,
  ): boolean {
    const parsedPolicy = properties.policyDocumentParser.parse(policy.document);
    let allowed = false;

    for (const statement of parsedPolicy.statements) {
      if (!properties.statementMatcher.matches(policy, statement).matched) {
        continue;
      }

      if (statement.effect === "Deny") {
        this.denyStatementRecords.push(statement.source);
        continue;
      }

      this.allowStatementRecords.push(statement.source);
      allowed = true;
    }

    return allowed;
  }
}

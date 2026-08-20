import type { SimWafManagedRequestParts } from "./sim-waf-managed-request.js";

/**
 * How closely one simulated managed rule follows the AWS rule it stands for.
 *
 * AWS publishes every rule name, every default action, every label and the
 * size limits, and holds back the pattern set behind each rule. What can be
 * simulated therefore varies by rule, and each one says which it is rather
 * than leaving a reader to find out from a request that was not blocked.
 *
 * - `exact` matches where the AWS rule matches. The condition is documented
 *   in full, so there is nothing left to approximate.
 * - `documented` matches the patterns AWS published for the rule and nothing
 *   beyond them, so it detects less than the AWS rule does.
 * - `declared` detects nothing at all, and matches only a request a test
 *   declared a match for. The detection AWS runs is undocumented, and a guess
 *   at it would block requests AWS allows.
 */
export type SimWafManagedRuleTier = "exact" | "documented" | "declared";

/**
 * Whether one managed rule claims a request.
 */
export type SimWafManagedDetector = (
  parts: SimWafManagedRequestParts,
) => boolean;

/**
 * One rule of an AWS managed rule group.
 *
 * Every rule in the three simulated groups blocks by default, so the action is
 * not carried here. A rule with no detector is a declared-only rule.
 */
export interface SimWafManagedRuleDefinition {
  /** The rule name, as AWS names it and as an override names it. */
  readonly name: string;

  /** The label this rule adds, within its group's namespace. */
  readonly label: string;

  readonly tier: SimWafManagedRuleTier;

  readonly detects?: SimWafManagedDetector | undefined;
}

/**
 * One AWS managed rule group, in the order its rules are evaluated.
 */
export interface SimWafManagedRuleGroupDefinition {
  readonly name: string;

  /** The prefix every label this group adds is qualified by. */
  readonly labelNamespace: string;

  /** The WCUs the group costs, which `DescribeManagedRuleGroup` reports. */
  readonly capacity: number;

  readonly rules: readonly SimWafManagedRuleDefinition[];
}

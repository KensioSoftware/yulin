import type { SimWafInspectedRequest } from "../evaluate/sim-waf-inspected-request.js";
import { SimWafAction } from "../web-acl/sim-waf-action.js";
import type {
  SimWafManagedRuleDefinition,
  SimWafManagedRuleGroupDefinition,
} from "./sim-waf-managed-rule.type.js";

interface SimWafManagedRuleActionsProperties {
  readonly ruleName: string;
  readonly overrides: ReadonlyMap<string, SimWafAction>;
  readonly counting: boolean;
}

/**
 * What each rule of one managed rule group does to a request it claims.
 */
export interface SimWafManagedRuleActions {
  /** The action one rule of the group takes. */
  of(rule: SimWafManagedRuleDefinition): SimWafAction;

  /** The action a group answers with when its rules only counted. */
  readonly counted: SimWafAction;
}

/**
 * Settle what the rules of a group do, where the rule naming it is compiled.
 *
 * A rule takes its own default (`Block`, or `Count` for the few AWS ships
 * counting), an action override replaces that, and a group counting as a
 * whole counts whatever its rules were set to.
 */
export function simWafManagedRuleActions(
  properties: SimWafManagedRuleActionsProperties,
): SimWafManagedRuleActions {
  const { ruleName, overrides, counting } = properties;
  const blocking = SimWafAction.read({ Block: {} }, ruleName, {});
  const counted = SimWafAction.read({ Count: {} }, ruleName, {});
  const ownAction = (rule: SimWafManagedRuleDefinition): SimWafAction =>
    rule.counts === true ? counted : blocking;

  return {
    of: (rule): SimWafAction =>
      counting ? counted : (overrides.get(rule.name) ?? ownAction(rule)),
    counted,
  };
}

/**
 * Add labels to a request within a group's namespace.
 */
export function simWafAddGroupLabels(
  request: SimWafInspectedRequest,
  group: SimWafManagedRuleGroupDefinition,
  labels: readonly string[],
): void {
  for (const label of labels) {
    request.labels.add(`${group.labelNamespace}:${label}`);
  }
}

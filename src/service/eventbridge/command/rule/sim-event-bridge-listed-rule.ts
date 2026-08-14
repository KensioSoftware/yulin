import type { SimEventRule } from "../../rule/sim-event-rule.js";
import type { SimListedRule } from "./rule.command.js";

/**
 * One rule as a describe or a listing reports it.
 *
 * The pattern comes back as the string the rule was created with rather than a
 * re-serialised version of it, so a caller comparing what they read against
 * what they sent sees what they sent.
 */
export function listedRule(rule: SimEventRule): SimListedRule {
  return {
    Name: rule.name.value,
    Arn: rule.arn,
    EventPattern: rule.pattern.source,
    State: rule.state.value,
    Description: rule.description,
    EventBusName: rule.busName.value,
  };
}

/**
 * The rules a listing reports, narrowed to a name prefix when one is asked
 * for.
 */
export function listedRules(
  rules: readonly SimEventRule[],
  namePrefix: string | undefined,
): readonly SimListedRule[] {
  if (namePrefix === undefined) {
    return rules.map(listedRule);
  }

  return rules
    .filter((rule) => rule.name.value.startsWith(namePrefix))
    .map(listedRule);
}

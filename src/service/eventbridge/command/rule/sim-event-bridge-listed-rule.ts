import type { SimEventRule } from "../../rule/sim-event-rule.js";
import type { SimListedRule } from "./rule.command.js";

/**
 * One rule as a describe or a listing reports it.
 *
 * The pattern and the schedule expression both come back as the strings the
 * rule was created with rather than re-serialised versions of them, so a caller
 * comparing what they read against what they sent sees what they sent. A rule
 * with only a schedule reports no pattern, and the other way round.
 */
export function listedRule(rule: SimEventRule): SimListedRule {
  return {
    Name: rule.name.value,
    Arn: rule.arn,
    EventPattern: rule.pattern?.source,
    ScheduleExpression: rule.schedule?.source,
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
